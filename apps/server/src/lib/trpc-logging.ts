import type { TRPCCallLog } from '../types/logging';
import { LoggingService } from './logging-service';
import { getContext } from 'hono/context-storage';
import type { HonoContext } from '../ctx';
import { logger } from './logger';

// Utility function to hash IP addresses for PII protection
function hashIpAddress(ip: string | undefined): string | undefined {
  if (!ip) return undefined;

  // Simple but effective hash for IP addresses
  // This preserves uniqueness while protecting PII
  const salt = 'zero-mail-ip-salt-2024'; // Consider using env variable for production
  let hash = 0;
  const str = ip + salt;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Return a prefixed hex representation
  return `ip_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export interface LoggingContext {
  sessionId: string;
  userId?: string;
}

// Content-bearing procedures: their input/output carry mail bodies, draft text or
// assistant prompts. Exporting those payloads (Datadog) would leak mailbox content —
// ship an opaque size stub instead. Metadata (procedure, duration, hashed IP) stays.
const CONTENT_BEARING_PREFIXES = [
  'ai.',
  'copilot.',
  'mail.',
  'drafts.',
  'notes.',
  'templates.',
  'outbox.',
];

const isContentBearingProcedure = (path: string) =>
  CONTENT_BEARING_PREFIXES.some((prefix) => path.startsWith(prefix));

/** Replace a content-bearing payload with `{redacted, size}`; pass others through. */
export const redactCallPayload = (path: string, value: unknown): unknown => {
  if (!isContentBearingProcedure(path)) return value;
  let size = 0;
  try {
    size = value === undefined ? 0 : (JSON.stringify(value)?.length ?? 0);
  } catch {
    size = -1;
  }
  return { redacted: true, size };
};

export const createLoggingMiddleware = () => {
  return async (opts: {
    path: string;
    type: 'query' | 'mutation' | 'subscription';
    // tRPC's MiddlewareBuilder passes concrete generics here; these stay loose to
    // remain assignable to that contract (the internal sanitizer below is typed).
    next: () => Promise<any>;
    input: any;
    ctx: any;
  }) => {
    const startTime = Date.now();
    const c = getContext<HonoContext>();
    const sessionId = c.var.sessionUser?.id || 'anonymous';
    const userId = c.var.sessionUser?.id;

    // Initialize logging service
    // Devlab: Datadog export is opt-in — without DD_API_KEY, skip silently
    // instead of constructing-and-throwing on every single tRPC call.
    let loggingService: LoggingService | undefined;
    if (userId && c.env && c.env.DD_API_KEY && c.env.DD_APP_KEY) {
      try {
        loggingService = new LoggingService(c.env);
        loggingService.initializeSession(sessionId, userId);
      } catch (error) {
        logger.error('Failed to initialize logging service:', error);
      }
    }

    // Holds the tRPC `next()` result; kept loose so the middleware return type stays
    // assignable to tRPC's MiddlewareBuilder contract.
    let output: any;
    let error: string | undefined;

    // Start TRPC procedure execution span
    const { addRequestSpan, completeRequestSpan } = await import('./trace-context');
    const procedureSpan = addRequestSpan(
      c,
      'trpc_procedure_execution',
      {
        procedure: opts.path,
        type: opts.type,
        hasInput: !!opts.input,
        inputSize: opts.input ? JSON.stringify(opts.input).length : 0,
      },
      {
        'trpc.procedure': opts.path,
        'trpc.type': opts.type,
      },
    );

    try {
      // Execute the TRPC call
      output = await opts.next();

      // Complete procedure span
      if (procedureSpan) {
        completeRequestSpan(c, procedureSpan.id, {
          success: true,
          hasOutput: !!output,
          outputSize: output ? JSON.stringify(output).length : 0,
        });
      }

      // Log using the new logging service
      if (loggingService) {
        // Sanitize output to remove non-serializable objects — deep clone,
        // only worth paying when a logging service is actually exporting.
        const sanitizeOutput = (obj: unknown): unknown => {
          if (obj === null || obj === undefined) return obj;
          if (typeof obj !== 'object') return obj;
          if (Array.isArray(obj)) return obj.map(sanitizeOutput);

          const sanitized: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj)) {
            // Skip known non-serializable fields
            if (key === 'ctx' && value && typeof value === 'object') {
              continue;
            }

            try {
              structuredClone(value);
              sanitized[key] = sanitizeOutput(value);
            } catch {
              // If it can't be serialized, replace with a description
              sanitized[key] = `[Non-serializable: ${value?.constructor?.name || typeof value}]`;
            }
          }
          return sanitized;
        };

        // Log successful call
        const callData: TRPCCallLog = {
          id: crypto.randomUUID(),
          timestamp: startTime,
          userId: userId || 'anonymous',
          sessionId,
          procedure: opts.path,
          input: redactCallPayload(opts.path, opts.input),
          output: redactCallPayload(opts.path, sanitizeOutput(output)),
          duration: Date.now() - startTime,
          metadata: {
            method: opts.type,
            userAgent: c.req.header('User-Agent'),
            ip: hashIpAddress(c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')),
            referer: c.req.header('Referer'),
            origin: c.req.header('Origin'),
            acceptLanguage: c.req.header('Accept-Language'),
            acceptEncoding: c.req.header('Accept-Encoding'),
            requestId: c.req.header('X-Request-Id') || crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            startTime,
            endTime: Date.now(),
          },
        };

        const { getRequestTrace } = await import('./trace-context');

        // Get the complete trace for this request
        const trace = getRequestTrace(c);

        // Add trace to call data
        if (trace) {
          callData.trace = {
            traceId: trace.traceId,
            requestStartTime: trace.startTime,
            requestEndTime: trace.endTime,
            requestDuration: trace.duration,
            spans: trace.spans,
            totalSpans: trace.spans.length,
            completedSpans: trace.spans.filter((s) => s.status === 'completed').length,
            errorSpans: trace.spans.filter((s) => s.status === 'error').length,
          };
          callData.metadata.traceId = trace.traceId;
          callData.metadata.requestDuration = trace.duration;
        }

        // Console sink (visible via wrangler tail / logpush) — one timing
        // line per call, independent of the Datadog export being configured.
        logger.info('trpc.call', {
          procedure: opts.path,
          method: opts.type,
          durationMs: callData.duration,
        });

        // Log using the new service which will immediately log to Datadog
        loggingService.logCall(callData).catch((err) => {
          logger.error('Failed to log TRPC call:', err);
        });

        // Complete the trace after logging
        if (trace) {
          const { TraceContext } = await import('./trace-context');
          TraceContext.completeTrace(trace.traceId);
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';

      // Complete procedure span with error
      if (procedureSpan) {
        completeRequestSpan(
          c,
          procedureSpan.id,
          {
            success: false,
            errorType: err instanceof Error ? err.constructor.name : 'UnknownError',
          },
          error,
        );
      }

      // Log error using the new logging service
      if (loggingService) {
        // Log failed call
        const callData: TRPCCallLog = {
          id: crypto.randomUUID(),
          timestamp: startTime,
          userId: userId || 'anonymous',
          sessionId,
          procedure: opts.path,
          input: redactCallPayload(opts.path, opts.input),
          error,
          duration: Date.now() - startTime,
          metadata: {
            method: opts.type,
            userAgent: c.req.header('User-Agent'),
            ip: hashIpAddress(c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')),
            referer: c.req.header('Referer'),
            origin: c.req.header('Origin'),
            acceptLanguage: c.req.header('Accept-Language'),
            acceptEncoding: c.req.header('Accept-Encoding'),
            requestId: c.req.header('X-Request-Id') || crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            startTime,
            endTime: Date.now(),
          },
        };

        const { getRequestTrace } = await import('./trace-context');

        // Get the complete trace for this request
        const trace = getRequestTrace(c);

        // Add trace to call data
        if (trace) {
          callData.trace = {
            traceId: trace.traceId,
            requestStartTime: trace.startTime,
            requestEndTime: trace.endTime,
            requestDuration: trace.duration,
            spans: trace.spans,
            totalSpans: trace.spans.length,
            completedSpans: trace.spans.filter((s) => s.status === 'completed').length,
            errorSpans: trace.spans.filter((s) => s.status === 'error').length,
          };
          callData.metadata.traceId = trace.traceId;
          callData.metadata.requestDuration = trace.duration;
        }

        logger.info('trpc.call', {
          procedure: opts.path,
          method: opts.type,
          durationMs: callData.duration,
          error: true,
        });

        // Log using the new service which will immediately log to Datadog
        loggingService.logCall(callData).catch((logErr) => {
          logger.error('Failed to log TRPC error:', logErr);
        });

        // Complete the trace after logging error
        if (trace) {
          const { TraceContext } = await import('./trace-context');
          TraceContext.completeTrace(trace.traceId);
        }
      }

      throw err;
    }

    return output;
  };
};

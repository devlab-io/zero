import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('structured logger — nested causes', () => {
  it('preserves a bounded Error.cause chain for production diagnosis', () => {
    const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
    const postgresError = new Error('connection acquisition timeout');
    postgresError.name = 'PostgresError';
    const drizzleError = new Error('Failed query', { cause: postgresError });
    const trpcError = new Error('Internal server error', { cause: drizzleError });

    logger.error('Error in TRPC handler:', trpcError);

    const line = String(sink.mock.calls[0]?.[0]);
    const entry = JSON.parse(line) as {
      data: Array<{ cause?: { cause?: { name?: string; message?: string } } }>;
    };
    expect(entry.data[0]?.cause?.cause).toMatchObject({
      name: 'PostgresError',
      message: 'connection acquisition timeout',
    });
  });
});

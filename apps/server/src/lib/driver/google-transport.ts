import {
  deleteActiveConnection,
  FatalErrors,
  sanitizeContext,
  StandardizedError,
} from './utils';
import { GOOGLE_OAUTH_SCOPE_STRING } from '../google-scopes';
import { type gmail_v1, gmail } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';
import type { ManagerConfig } from './types';
import { env } from '../../env';

/**
 * GmailTransport — point UNIQUE d'exécution des requêtes Gmail HTTP du driver Google.
 *
 * Contrat consommé par l'issue #31 (batch/backoff Gmail) :
 * chaque requête Gmail REST du driver est dispatchée via {@link GmailTransport.execute},
 * qui applique aujourd'hui la stratégie requête-par-requête (un appel HTTP par invocation).
 * `execute(fn) = fn(this.gmail)` — passe-plat strict, comportement réseau inchangé, types
 * préservés par généricité. #31 branchera batch/backoff en surchargeant CETTE seule méthode
 * (ou le client `gmail` qu'elle possède), sans toucher aucun module de domaine.
 *
 * Le transport possède aussi : le client OAuth2 (`auth`, pour tokens et People API), la
 * config immuable (`config`), la normalisation d'erreur par opération
 * (`withErrorHandler`/`withSyncErrorHandler`) et la dérivation du quotaUser.
 */
export class GmailTransport {
  readonly auth: OAuth2Client;
  readonly gmail: gmail_v1.Gmail;

  constructor(public readonly config: ManagerConfig) {
    this.auth = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);

    if (config.auth)
      this.auth.setCredentials({
        refresh_token: config.auth.refreshToken,
        scope: this.getScope(),
      });

    this.gmail = gmail({ version: 'v1', auth: this.auth });
  }

  public getScope(): string {
    return GOOGLE_OAUTH_SCOPE_STRING;
  }

  public getQuotaUser() {
    return this.config.auth?.email ? `${this.config.auth.email}-${env.NODE_ENV}` : undefined;
  }

  /**
   * Exécute une requête Gmail HTTP unique. Stratégie actuelle : requête-par-requête
   * (`fn` est invoqué immédiatement contre le client possédé). Couture #31.
   */
  public execute<T>(fn: (gmail: gmail_v1.Gmail) => Promise<T>): Promise<T> {
    return fn(this.gmail);
  }

  public async withErrorHandler<T>(
    operation: string,
    fn: () => Promise<T> | T,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await Promise.resolve(fn());
    } catch (error) {
      const err = error as Error & { code: string };
      const isFatal = FatalErrors.includes(err.message);
      console.error(
        `[${isFatal ? 'FATAL_ERROR' : 'ERROR'}] [Gmail Driver] Operation: ${operation}`,
        {
          error: err.message,
          code: err.code,
          context: sanitizeContext(context),
          stack: err.stack,
          isFatal,
        },
      );
      if (isFatal) await deleteActiveConnection();
      throw new StandardizedError(err, operation, context);
    }
  }

  public withSyncErrorHandler<T>(
    operation: string,
    fn: () => T,
    context?: Record<string, unknown>,
  ): T {
    try {
      return fn();
    } catch (error) {
      const err = error as Error & { code: string };
      const isFatal = FatalErrors.includes(err.message);
      console.error(`[Gmail Driver Error] Operation: ${operation}`, {
        error: err.message,
        code: err.code,
        context: sanitizeContext(context),
        stack: err.stack,
        isFatal,
      });
      if (isFatal) void deleteActiveConnection();
      throw new StandardizedError(err, operation, context);
    }
  }
}

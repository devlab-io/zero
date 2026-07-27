import type { GmailTransport } from './google-transport';
import { people } from '@googleapis/people';
import { logger } from '../logger';

export class GmailAccount {
  constructor(private readonly t: GmailTransport) {}

  public getTokens<T>(code: string) {
    return this.t.withErrorHandler(
      'getTokens',
      async () => {
        const { tokens } = await this.t.auth.getToken(code);
        return { tokens } as T;
      },
      { code },
    );
  }

  public getUserInfo() {
    return this.t.withErrorHandler(
      'getUserInfo',
      async () => {
        const res = await people({ version: 'v1', auth: this.t.auth }).people.get({
          resourceName: 'people/me',
          personFields: 'names,photos,emailAddresses',
        });
        return {
          address: res.data.emailAddresses?.[0]?.value ?? '',
          name: res.data.names?.[0]?.displayName ?? '',
          photo: res.data.photos?.[0]?.url ?? '',
        };
      },
      {},
    );
  }

  public getEmailAliases() {
    return this.t.withErrorHandler('getEmailAliases', async () => {
      const profile = await this.t.execute(
        (gmail, signal) =>
          gmail.users.getProfile(
            {
              userId: 'me',
            },
            { signal },
          ),
        { retry: true },
      );

      const primaryEmail = profile.data.emailAddress || '';
      const aliases: { email: string; name?: string; primary?: boolean }[] = [
        { email: primaryEmail, primary: true },
      ];

      const settings = await this.t.execute(
        (gmail, signal) =>
          gmail.users.settings.sendAs.list(
            {
              userId: 'me',
            },
            { signal },
          ),
        { retry: true },
      );

      if (settings.data.sendAs) {
        settings.data.sendAs.forEach((alias) => {
          if (alias.isPrimary && alias.sendAsEmail === primaryEmail) {
            return;
          }

          aliases.push({
            email: alias.sendAsEmail || '',
            name: alias.displayName || undefined,
            primary: alias.isPrimary || false,
          });
        });
      }

      return aliases;
    });
  }

  public async revokeToken(token: string) {
    if (!token) return false;
    try {
      await this.t.auth.revokeToken(token);
      return true;
    } catch (error: unknown) {
      logger.error('Failed to revoke Google token:', (error as Error).message);
      return false;
    }
  }
}

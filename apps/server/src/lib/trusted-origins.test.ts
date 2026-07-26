import { describe, expect, it } from 'vitest';

import { resolveTrustedOrigins } from './trusted-origins';

const PROD = {
  NODE_ENV: 'production',
  VITE_PUBLIC_APP_URL: 'https://mail.devlab.test',
  VITE_PUBLIC_BACKEND_URL: 'https://api.devlab.test',
};

describe('resolveTrustedOrigins', () => {
  it('ne garde que l’application et le backend en production', () => {
    expect(resolveTrustedOrigins(PROD)).toEqual([
      'https://mail.devlab.test',
      'https://api.devlab.test',
    ]);
  });

  it('n’accorde plus la confiance aux domaines de l’amont', () => {
    const origins = resolveTrustedOrigins(PROD);
    for (const upstream of [
      'https://0.email',
      'https://app.0.email',
      'https://sapi.0.email',
      'https://staging.0.email',
    ]) {
      expect(origins).not.toContain(upstream);
    }
  });

  it('n’accorde pas la confiance à localhost hors développement local', () => {
    for (const NODE_ENV of ['production', 'development']) {
      const origins = resolveTrustedOrigins({ ...PROD, NODE_ENV });
      expect(origins).not.toContain('http://localhost:3000');
      expect(origins).not.toContain('http://localhost:3001');
    }
  });

  it('ajoute les origines locales en NODE_ENV=local', () => {
    const origins = resolveTrustedOrigins({
      NODE_ENV: 'local',
      VITE_PUBLIC_APP_URL: 'http://localhost:3000',
      VITE_PUBLIC_BACKEND_URL: 'http://localhost:8787',
    });

    expect(origins).toContain('http://localhost:3000');
    expect(origins).toContain('http://localhost:3001');
    expect(origins).toContain('http://localhost:8787');
  });

  it('honore BETTER_AUTH_TRUSTED_ORIGINS comme point d’extension explicite', () => {
    const origins = resolveTrustedOrigins({
      ...PROD,
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://extra.devlab.test, https://autre.devlab.test',
    });

    expect(origins).toContain('https://extra.devlab.test');
    expect(origins).toContain('https://autre.devlab.test');
  });

  it('normalise en origine et déduplique', () => {
    const origins = resolveTrustedOrigins({
      ...PROD,
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://mail.devlab.test/inbox?a=1',
    });

    expect(origins).toEqual(['https://mail.devlab.test', 'https://api.devlab.test']);
  });

  it('ignore les valeurs vides ou illisibles plutôt que de les propager', () => {
    const origins = resolveTrustedOrigins({
      NODE_ENV: 'production',
      VITE_PUBLIC_APP_URL: '',
      VITE_PUBLIC_BACKEND_URL: 'https://api.devlab.test',
      BETTER_AUTH_TRUSTED_ORIGINS: 'pas-une-url, ,https://ok.devlab.test',
    });

    expect(origins).toEqual(['https://api.devlab.test', 'https://ok.devlab.test']);
  });
});

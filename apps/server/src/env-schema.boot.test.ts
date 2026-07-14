import { assertServerEnv, requiredServerEnvSchema } from './env-schema';
import { describe, expect, it } from 'vitest';

// Complément du garde de boot zod (env-schema.test.ts) : preuve exhaustive que CHACUNE des
// 7 variables requises fait échouer le boot si absente/vide, et que les clés hors-schéma
// (bindings DO/KV/Queues, features optionnelles, DATABASE_URL/BETTER_AUTH_URL jamais lues
// au runtime — incident M2) sont ignorées.
const REQUIRED = [
  'BETTER_AUTH_SECRET',
  'JWT_SECRET',
  'COOKIE_DOMAIN',
  'VITE_PUBLIC_APP_URL',
  'VITE_PUBLIC_BACKEND_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const;

const complete: Record<string, string> = Object.fromEntries(REQUIRED.map((k) => [k, `val-${k}`]));

describe('requiredServerEnvSchema — forme', () => {
  it('déclare exactement les 7 clés requises', () => {
    expect(Object.keys(requiredServerEnvSchema.shape).sort()).toEqual([...REQUIRED].sort());
  });

  it('parse un env complet avec succès', () => {
    expect(requiredServerEnvSchema.safeParse(complete).success).toBe(true);
  });
});

describe('assertServerEnv — chaque clé requise garde le boot', () => {
  it.each(REQUIRED)('échoue en nommant %s quand elle est absente', (key) => {
    const { [key]: _omit, ...missing } = complete;
    expect(() => assertServerEnv(missing)).toThrow(new RegExp(key));
  });

  it.each(REQUIRED)('échoue en nommant %s quand elle est une chaîne vide', (key) => {
    expect(() => assertServerEnv({ ...complete, [key]: '' })).toThrow(new RegExp(key));
  });

  it('ne lève pas quand tout est présent', () => {
    expect(() => assertServerEnv(complete)).not.toThrow();
  });

  it('ignore les clés hors-schéma (bindings + features optionnelles)', () => {
    expect(() =>
      assertServerEnv({
        ...complete,
        ZERO_DB: {},
        send_email_queue: {},
        DATABASE_URL: 'postgresql://outillage-local-uniquement',
        BETTER_AUTH_URL: 'https://jamais-lue-au-runtime',
        RESEND_API_KEY: undefined,
        NODE_ENV: 'production',
      }),
    ).not.toThrow();
  });

  it('le message d’erreur oriente vers .dev.vars', () => {
    const { JWT_SECRET: _o, ...missing } = complete;
    expect(() => assertServerEnv(missing)).toThrow(/\.dev\.vars/);
  });
});

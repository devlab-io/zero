import { describe, expect, it } from 'vitest';
import { assertServerEnv } from './env-schema';

const complete = {
  DATABASE_URL: 'postgres://localhost:5432/db',
  BETTER_AUTH_SECRET: 'secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  JWT_SECRET: 'jwt',
  COOKIE_DOMAIN: 'localhost',
  VITE_PUBLIC_APP_URL: 'http://localhost:3000',
  VITE_PUBLIC_BACKEND_URL: 'http://localhost:8787',
  GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'gsecret',
};

describe('assertServerEnv', () => {
  it('passes with all required vars present', () => {
    expect(() => assertServerEnv(complete)).not.toThrow();
  });

  it('passes when only optional vars are absent (extra keys are ignored)', () => {
    expect(() => assertServerEnv({ ...complete, RESEND_API_KEY: undefined })).not.toThrow();
  });

  it('throws immediately, naming the missing key', () => {
    const { BETTER_AUTH_SECRET: _omit, ...missing } = complete;
    expect(() => assertServerEnv(missing)).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('treats an empty string as missing and names it', () => {
    expect(() => assertServerEnv({ ...complete, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('names every missing key', () => {
    const { JWT_SECRET: _a, COOKIE_DOMAIN: _b, ...missing } = complete;
    const run = () => assertServerEnv(missing);
    expect(run).toThrow(/JWT_SECRET/);
    expect(run).toThrow(/COOKIE_DOMAIN/);
  });
});

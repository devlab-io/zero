import {
  ALLOWED_BUILD_ENVS,
  assertBuildEnv,
  assertClientBundleEnv,
  getBuildEnvConfig,
} from './build-env';
import { describe, expect, it } from 'vitest';

describe('garde build env — CLOUDFLARE_ENV obligatoire et valide', () => {
  it('CLOUDFLARE_ENV absent → échec du build avec le remède', () => {
    expect(() => assertBuildEnv({})).toThrow(/CLOUDFLARE_ENV is required/);
    expect(() => assertBuildEnv({ CLOUDFLARE_ENV: undefined })).toThrow(
      /local, staging, production/,
    );
  });

  it('valeur inconnue (typo) → échec explicite', () => {
    expect(() => assertBuildEnv({ CLOUDFLARE_ENV: 'prod' })).toThrow(
      /does not match any wrangler\.jsonc env block/,
    );
  });

  it('chaque bloc wrangler.jsonc est accepté', () => {
    for (const name of ALLOWED_BUILD_ENVS) {
      expect(assertBuildEnv({ CLOUDFLARE_ENV: name })).toBe(name);
      const config = getBuildEnvConfig(name);
      expect(new URL(config.backendUrl).protocol).toMatch(/^https?:$/);
      expect(new URL(config.appUrl).protocol).toMatch(/^https?:$/);
    }
  });

  it("inspecte l'artefact final, pas seulement le nom d'environnement", () => {
    const config = getBuildEnvConfig('production');
    expect(() =>
      assertClientBundleEnv([`${config.backendUrl} ${config.appUrl}`], config),
    ).not.toThrow();
    expect(() =>
      assertClientBundleEnv([`${config.backendUrl} ${config.appUrl} undefined/api`], config),
    ).toThrow(/forbidden runtime URL/);
    expect(() => assertClientBundleEnv([config.backendUrl], config)).toThrow(/missing app URL/);
  });
});

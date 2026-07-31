/**
 * Garde d'environnement de build (CI, Docker, local — tout chemin qui exécute
 * `vite build` passe ici via vite.config.ts).
 *
 * Le bundle client fige `import.meta.env.VITE_PUBLIC_BACKEND_URL` depuis les
 * `vars` du bloc wrangler.jsonc sélectionné par CLOUDFLARE_ENV. Sans
 * CLOUDFLARE_ENV (ou avec une typo), le plugin Cloudflare retombe sur le bloc
 * racine qui n'a AUCUNE var : le build réussit en silence avec un backend
 * `undefined` et ne casse qu'au runtime. On échoue au build, avec le remède.
 */

export const ALLOWED_BUILD_ENVS = ['local', 'staging', 'production'] as const;

export type BuildEnvName = (typeof ALLOWED_BUILD_ENVS)[number];

export function assertBuildEnv(env: Record<string, string | undefined>): BuildEnvName {
  const cloudflareEnv = env.CLOUDFLARE_ENV;
  if (!cloudflareEnv) {
    throw new Error(
      `CLOUDFLARE_ENV is required to build @zero/mail: the client bundle bakes ` +
        `VITE_PUBLIC_BACKEND_URL from the matching wrangler.jsonc env block. ` +
        `Set CLOUDFLARE_ENV to one of: ${ALLOWED_BUILD_ENVS.join(', ')} ` +
        `(e.g. CLOUDFLARE_ENV=local pnpm build:frontend).`,
    );
  }
  if (!(ALLOWED_BUILD_ENVS as readonly string[]).includes(cloudflareEnv)) {
    throw new Error(
      `CLOUDFLARE_ENV="${cloudflareEnv}" does not match any wrangler.jsonc env block. ` +
        `Allowed values: ${ALLOWED_BUILD_ENVS.join(', ')}.`,
    );
  }
  return cloudflareEnv as BuildEnvName;
}

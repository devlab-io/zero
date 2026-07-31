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

export type BuildEnvConfig = {
  name: BuildEnvName;
  backendUrl: string;
  appUrl: string;
};

const BUILD_ENV_URLS: Record<BuildEnvName, Omit<BuildEnvConfig, 'name'>> = {
  local: {
    backendUrl: 'http://localhost:8787',
    appUrl: 'http://localhost:3000',
  },
  staging: {
    backendUrl: 'https://zero-server-staging.devlab-tahiti.workers.dev',
    appUrl: 'https://zero-staging.devlab-tahiti.workers.dev',
  },
  production: {
    backendUrl: 'https://zero-server-production.devlab-tahiti.workers.dev',
    appUrl: 'https://zero-production.devlab-tahiti.workers.dev',
  },
};

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

export function getBuildEnvConfig(name: BuildEnvName): BuildEnvConfig {
  const config = { name, ...BUILD_ENV_URLS[name] };
  for (const [key, value] of Object.entries(config).filter(([key]) => key !== 'name')) {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`${key} for CLOUDFLARE_ENV="${name}" must be an http(s) URL.`);
    }
  }
  return config;
}

/**
 * Dernier filet : inspecte le bundle client réellement produit. Une simple
 * validation de CLOUDFLARE_ENV ne suffit pas si le plugin de build oublie
 * d'injecter les vars Wrangler (l'incident prod du 31/07/2026).
 */
export function assertClientBundleEnv(sources: readonly string[], config: BuildEnvConfig): void {
  const bundle = sources.join('\n');
  const forbidden = ['undefined/api', 'undefined/login', 'undefined/mail'];
  const leaked = forbidden.find((value) => bundle.includes(value));
  if (leaked) {
    throw new Error(`Client bundle contains forbidden runtime URL "${leaked}".`);
  }
  if (!bundle.includes(config.backendUrl)) {
    throw new Error(`Client bundle is missing backend URL ${config.backendUrl}.`);
  }
  if (!bundle.includes(config.appUrl)) {
    throw new Error(`Client bundle is missing app URL ${config.appUrl}.`);
  }
}

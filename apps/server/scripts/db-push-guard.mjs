#!/usr/bin/env node
// db:push guard (data-config §5). `drizzle-kit push` mutates the schema in place, so it must
// never hit production. This guard runs BEFORE push and refuses (exit 1) unless the target
// DATABASE_URL is local or staging. Escape hatch for a vetted staging host: DB_PUSH_ALLOW=1.
// drizzle.config.ts reads process.env.DATABASE_URL, so we check the exact same source.

const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    '[db:push] Refused: DATABASE_URL is not set — cannot verify the target is local/staging.',
  );
  process.exit(1);
}

let host = '';
try {
  host = new URL(url).hostname;
} catch {
  console.error('[db:push] Refused: DATABASE_URL is not a valid URL.');
  process.exit(1);
}

const LOCAL = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const isLocal = LOCAL.has(host) || host.endsWith('.local');
const isStaging = /staging|preview/i.test(url);
const override = /^(1|true|yes)$/i.test(process.env.DB_PUSH_ALLOW ?? '');

if (isLocal || isStaging || override) {
  const why = override ? 'DB_PUSH_ALLOW override' : isLocal ? 'local host' : 'staging host';
  console.log(`[db:push] Target host "${host}" accepted (${why}). Proceeding.`);
  process.exit(0);
}

console.error(
  `[db:push] Refused: target host "${host}" is neither local nor staging.\n` +
    '  db:push mutates the schema in place and must never run against production.\n' +
    '  Use db:migrate for non-local targets, or set DB_PUSH_ALLOW=1 for a vetted staging host.',
);
process.exit(1);

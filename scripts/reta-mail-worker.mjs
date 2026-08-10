#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const API_URL = (
  process.env.RETA_WORKER_API_URL || 'https://zero-server-production.devlab-tahiti.workers.dev'
).replace(/\/$/, '');
const APP_URL = (
  process.env.RETA_APP_URL || 'https://zero-production.devlab-tahiti.workers.dev'
).replace(/\/$/, '');
const POLL_MS = Number(process.env.RETA_WORKER_POLL_MS || 15_000);
const RUNTIME_CHECK_MS = Number(process.env.RETA_WORKER_RUNTIME_CHECK_MS || 5 * 60_000);
const CODEX_PATH = process.env.RETA_CODEX_PATH || 'codex';
const KEYCHAIN_SERVICE = 'io.devlab.reta.mail-worker';
const KEYCHAIN_ACCOUNT = process.env.RETA_WORKER_KEYCHAIN_ACCOUNT || process.env.USER || 'default';
const STATE_DIR =
  process.env.RETA_WORKER_STATE_DIR || join(homedir(), '.local', 'state', 'reta-mail-worker');
const WORK_DIR = process.env.RETA_WORKER_WORK_DIR || join(STATE_DIR, 'workspace');
const SESSION_DIR = join(STATE_DIR, 'sessions');
const OUTPUT_SCHEMA =
  process.env.RETA_WORKER_OUTPUT_SCHEMA ||
  join(homedir(), '.local', 'share', 'reta-mail-worker', 'output.schema.json');
const CODEX_RUNTIME_PATH = Array.from(
  new Set(
    [
      dirname(process.execPath),
      dirname(CODEX_PATH),
      ...(process.env.PATH || '').split(':'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ].filter(Boolean),
  ),
).join(':');
let runtimeCheckedAt = 0;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const log = (message, fields = {}) =>
  process.stdout.write(`${new Date().toISOString()} ${message} ${JSON.stringify(fields)}\n`);

async function keychainToken() {
  const { stdout } = await execFileAsync('/usr/bin/security', [
    'find-generic-password',
    '-s',
    KEYCHAIN_SERVICE,
    '-a',
    KEYCHAIN_ACCOUNT,
    '-w',
  ]);
  const token = stdout.trim();
  if (!token) throw new Error('Jeton RETA absent du Trousseau macOS');
  return token;
}

async function workerFetch(path, token, init = {}) {
  const response = await fetch(`${API_URL}/api/reta-mail-worker${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const parts = [body.error, body.message].filter(
      (part, index, values) =>
        typeof part === 'string' && part.trim() && values.indexOf(part) === index,
    );
    const error = new Error(parts.length ? parts.join(': ') : `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function ensureCodexRuntime() {
  if (Date.now() - runtimeCheckedAt < RUNTIME_CHECK_MS) return;
  try {
    const { stdout } = await execFileAsync(CODEX_PATH, ['--version'], {
      env: { ...process.env, PATH: CODEX_RUNTIME_PATH },
      timeout: 15_000,
    });
    const version = stdout.trim();
    if (!version) throw new Error('version absente');
    runtimeCheckedAt = Date.now();
    log('worker_runtime_ready', { version });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Runtime Codex indisponible (${detail.slice(0, 180)}). Aucun brouillon n’a été réservé.`,
    );
  }
}

const promptFor = (job) =>
  `
Tu travailles comme correcteur de brouillons pour RETA.

Contraintes absolues :
- ne lance aucun outil et n'effectue aucune action externe ;
- ne crée et n'envoie aucun email ;
- retourne uniquement l'objet JSON demandé par le schéma ;
- retourne le corps en HTML simple, avec seulement les balises utiles à un email ;
- conserve strictement les noms, dates, montants, liens et engagements présents ;
- n'invente aucun fait ;
- écris dans la langue du fil, avec un ton naturel, direct et sans formules creuses ;
- pour une correction, applique l'instruction sans modifier inutilement le reste.

Travail : ${job.kind === 'compose' ? 'rédiger une réponse à partir du fil' : 'corriger le brouillon existant'}.
Instruction de Thomas : ${job.instruction}

Données RETA :
${JSON.stringify({
  to: job.to,
  cc: job.cc,
  bcc: job.bcc,
  subject: job.subject,
  body: job.body,
  sourceAttachments: job.sourceAttachments,
  thread: job.context,
})}
`.trim();

async function readOptional(path) {
  return readFile(path, 'utf8')
    .then((value) => value.trim())
    .catch(() => '');
}

const sessionFile = (jobId) =>
  join(SESSION_DIR, `${jobId.replace(/[^a-zA-Z0-9_-]/g, '_')}.session`);

async function resetSession(jobId) {
  await unlink(sessionFile(jobId)).catch(() => {});
}

async function runCodex(job, allowFreshRetry = true) {
  await mkdir(WORK_DIR, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'reta-mail-worker-'));
  const outputFile = join(temporaryDirectory, 'result.json');
  try {
    const activeSessionId = await readOptional(sessionFile(job.id));
    const common = [
      '--ignore-user-config',
      '--ignore-rules',
      '--output-schema',
      OUTPUT_SCHEMA,
      '--output-last-message',
      outputFile,
      '--json',
    ];
    const args = activeSessionId
      ? ['exec', 'resume', ...common, activeSessionId, '-']
      : ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', WORK_DIR, ...common, '-'];
    let stdout = '';
    let stderr = '';
    const child = spawn(CODEX_PATH, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: CODEX_RUNTIME_PATH },
    });
    // A launcher can exit before consuming stdin (bad runtime, invalid flags,
    // etc.). EPIPE must be reported through the normal exit-code path instead
    // of crashing the long-lived launchd process.
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') stderr += `\nstdin: ${error.message}`;
    });
    child.stdin.end(promptFor(job));
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    if (exitCode !== 0) {
      if (activeSessionId && allowFreshRetry) {
        await resetSession(job.id);
        return runCodex(job, false);
      }
      throw new Error(`Codex a quitté avec le code ${exitCode}: ${stderr.slice(-400)}`);
    }

    const started = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .find((event) => event?.type === 'thread.started' && typeof event.thread_id === 'string');
    if (!activeSessionId && started?.thread_id) {
      await writeFile(sessionFile(job.id), `${started.thread_id}\n`, { mode: 0o600 });
    }
    const result = JSON.parse(await readFile(outputFile, 'utf8'));
    if (typeof result.subject !== 'string' || typeof result.body !== 'string') {
      throw new Error('Réponse Codex invalide');
    }
    return result;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function processOne(token) {
  // Validate the complete launchd -> codex -> node chain before claiming a
  // server job. A broken runtime therefore stays pending instead of creating a
  // visible code-127 failure in RETA.
  await ensureCodexRuntime();
  const claimed = await workerFetch('/jobs/claim-next', token, {
    method: 'POST',
    body: '{}',
  });
  if (!claimed.job) return false;
  const job = claimed.job;
  log('job_claimed', { jobId: job.id, kind: job.kind });
  try {
    const result = await runCodex(job);
    await workerFetch(`/jobs/${encodeURIComponent(job.id)}/complete`, token, {
      method: 'POST',
      body: JSON.stringify({
        claimToken: job.claimToken,
        subject: result.subject,
        body: result.body,
      }),
    });
    log('job_completed', { jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await workerFetch(`/jobs/${encodeURIComponent(job.id)}/fail`, token, {
      method: 'POST',
      body: JSON.stringify({ claimToken: job.claimToken, error: message.slice(0, 2_000) }),
    }).catch(() => {});
    log('job_failed', { jobId: job.id, error: message.slice(0, 300) });
  } finally {
    await resetSession(job.id);
  }
  return true;
}

async function main() {
  await mkdir(SESSION_DIR, { recursive: true });
  const token = await keychainToken();
  if (process.env.RETA_OPEN_APP !== '0') {
    execFile('/usr/bin/open', [`${APP_URL}/queue`], () => {});
  }
  const once = process.argv.includes('--once');
  log('worker_started', { api: API_URL, once });
  do {
    try {
      const processed = await processOne(token);
      if (!processed && !once) await sleep(POLL_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('worker_poll_failed', { error: message.slice(0, 300) });
      if (!once) await sleep(Math.max(POLL_MS, 30_000));
    }
  } while (!once);
}

main().catch((error) => {
  log('worker_stopped', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});

// Fixtures partagées pour les tests des modules CRUD du driver Google (google-messages,
// google-threads, google-drafts, google-labels, google-account). Elles fournissent la
// SEULE frontière d'I/O — le client `gmail_v1` et les primitives batch du transport — et
// laissent le VRAI pipeline CRUD s'exécuter (construction d'URL, mapping de réponse,
// normalisation via google-parse, branches d'erreur). Même philosophie que
// batch-http-fake.ts : on injecte un faux HTTP, jamais un faux comportement produit.
//
// Couture : les classes CRUD reçoivent un `GmailTransport` par constructeur (import
// type-only, donc effacé). On injecte ici un transport factice dont `execute(fn)` appelle
// `fn(fakeGmail)` avec un client Gmail synthétique, et dont les primitives batch sont
// pilotées par le test. Aucun réseau, aucun timer, aucun env.
import type { gmail_v1 } from '@googleapis/gmail';
import type { ManagerConfig } from '../types';

export type GmailHandler = (params: Record<string, unknown>) => unknown;

/** Feuille du client Gmail factice : une méthode async renvoyant la réponse du handler. */
type GmailFakeLeaf = (params: Record<string, unknown>) => Promise<unknown>;
/** Nœud récursif du client Gmail factice (ex. `users` → `messages` → `get`). */
interface GmailFakeClient {
  [segment: string]: GmailFakeClient | GmailFakeLeaf;
}

/**
 * Construit un client Gmail factice à partir d'une map plate `chemin.pointé → handler`
 * (ex. `users.messages.get`). Chaque feuille devient une méthode async : un handler qui
 * LÈVE produit une promesse rejetée (comme le vrai client googleapis), servant les chemins
 * d'erreur. Le client est injecté tel quel au transport factice ; les modules CRUD, typés
 * contre `GmailTransport`, le consomment comme un `gmail_v1.Gmail`.
 */
export function makeFakeGmail(handlers: Record<string, GmailHandler>): GmailFakeClient {
  const root: GmailFakeClient = {};
  for (const [path, fn] of Object.entries(handlers)) {
    const segments = path.split('.');
    const leaf = segments.pop();
    if (leaf === undefined) continue;
    let node = root;
    for (const segment of segments) {
      let child = node[segment];
      if (child === undefined) {
        child = {};
        node[segment] = child;
      }
      if (typeof child === 'function') {
        throw new Error(`makeFakeGmail: collision de chemin sur "${segment}"`);
      }
      node = child;
    }
    // async ⇒ un throw synchrone du handler devient un rejet de promesse.
    node[leaf] = async (params: Record<string, unknown>) => fn(params);
  }
  return root;
}

/** Réponse gmail standard : le corps est enveloppé dans `{ data }` comme googleapis. */
export const data = <T>(d: T): { data: T } => ({ data: d });

/** Handler qui lève une erreur porteuse d'un `code` HTTP (chemins 4xx/5xx). */
export function gmailError(message: string, code?: number): () => never {
  return () => {
    const err = new Error(message) as Error & { code?: number };
    if (code !== undefined) err.code = code;
    throw err;
  };
}

/** Surface d'auth OAuth réellement utilisée par les tests google-account (tokens). */
export interface FakeAuth {
  getToken?: (code: string) => Promise<unknown>;
  revokeToken?: (token: string) => Promise<unknown>;
}

export interface FakeTransport {
  config: ManagerConfig;
  auth: FakeAuth;
  getQuotaUser: () => string | undefined;
  getScope: () => string;
  getGmailCallCount: () => number;
  execute: <T>(fn: (g: GmailFakeClient) => Promise<T>, opts?: { retry?: boolean }) => Promise<T>;
  withErrorHandler: <T>(op: string, fn: () => Promise<T> | T, ctx?: unknown) => Promise<T>;
  withSyncErrorHandler: <T>(op: string, fn: () => T, ctx?: unknown) => T;
  batchThreadsGet: (ids: readonly string[], format?: string) => Promise<Map<string, gmail_v1.Schema$Thread>>;
  batchAttachmentsGet: (
    refs: readonly { messageId: string; attachmentId: string }[],
  ) => Promise<string[]>;
  /** Journal d'observabilité pour les assertions (nb d'appels, ops, retry). */
  calls: {
    execute: number;
    retry: number;
    ops: string[];
    executeRetryFlags: boolean[];
  };
}

export interface FakeTransportOptions {
  config?: ManagerConfig;
  gmail?: GmailFakeClient;
  auth?: FakeAuth;
  batchThreadsGet?: (
    ids: readonly string[],
    format?: string,
  ) => Promise<Map<string, gmail_v1.Schema$Thread>>;
  batchAttachmentsGet?: (
    refs: readonly { messageId: string; attachmentId: string }[],
  ) => Promise<string[]>;
}

const defaultConfig = { auth: { email: 'user@devlab.io', refreshToken: 'refresh-abc' } } as ManagerConfig;

/**
 * Transport factice implémentant la surface étroite utilisée par les modules CRUD.
 *
 * Fidélité : `execute` compte le round-trip et appelle `fn(gmail)` (le VRAI corps CRUD
 * s'exécute). `withErrorHandler`/`withSyncErrorHandler` exécutent `fn` et LAISSENT REMONTER
 * les erreurs (le wrapping en StandardizedError est la responsabilité — déjà testée — de
 * google-transport ; ne pas wrapper ici permet d'asserter les messages d'erreur propres
 * levés PAR le code CRUD, ex. « No raw email data found »). Les primitives batch sont
 * pilotées par le test.
 */
export function makeFakeTransport(opts: FakeTransportOptions = {}): FakeTransport {
  const config = opts.config ?? defaultConfig;
  const gmail: GmailFakeClient = opts.gmail ?? {};
  const calls = { execute: 0, retry: 0, ops: [] as string[], executeRetryFlags: [] as boolean[] };
  return {
    config,
    auth: opts.auth ?? {},
    getQuotaUser: () => (config.auth?.email ? `${config.auth.email}-test` : undefined),
    getScope: () => 'https://www.googleapis.com/auth/gmail.modify',
    getGmailCallCount: () => calls.execute,
    execute: async <T>(fn: (g: GmailFakeClient) => Promise<T>, o?: { retry?: boolean }): Promise<T> => {
      calls.execute += 1;
      calls.executeRetryFlags.push(!!o?.retry);
      if (o?.retry) calls.retry += 1;
      return fn(gmail);
    },
    withErrorHandler: async <T>(op: string, fn: () => Promise<T> | T): Promise<T> => {
      calls.ops.push(op);
      return await Promise.resolve(fn());
    },
    withSyncErrorHandler: <T>(op: string, fn: () => T): T => {
      calls.ops.push(op);
      return fn();
    },
    batchThreadsGet: opts.batchThreadsGet ?? (async () => new Map()),
    batchAttachmentsGet: opts.batchAttachmentsGet ?? (async () => []),
    calls,
  };
}

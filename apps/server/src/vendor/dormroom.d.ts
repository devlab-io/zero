// Faithful local type declaration for the `dormroom` package and the modules it
// re-exports (`queryable-object`, `migratable-object`, `transferable-object`,
// `multistub`). Those packages ship raw `.ts` source authored for a bundler that
// does not type-check dependencies; under this repo's strict tsconfig
// (`verbatimModuleSyntax`, `strict`, no `experimentalDecorators`) `tsc` type-checks
// that imported `.ts` source and reports ~20 errors that live entirely inside
// node_modules and cannot be edited reproducibly.
//
// This file mirrors ONLY the public surface `apps/server` consumes, with types
// copied verbatim from node_modules/dormroom@1.0.1/mod.ts and
// queryable-object@0.0.8 / migratable-object@0.0.12 / transferable-object@0.0.22.
// It is wired in via `apps/server/tsconfig.json` -> compilerOptions.paths so `tsc`
// resolves `dormroom` here instead of walking into the untyped `.ts` sources.
// Runtime is unaffected: this is types-only; wrangler bundles the real JS from
// node_modules. `strict` is untouched — this only narrows the vendor boundary.
//
// Ambient runtime types (SqlStorage, DurableObjectStub, DurableObjectNamespace,
// ExecutionContext, Rpc.*) come from worker-configuration.d.ts / @cloudflare/workers-types.

// Same import the real transferable-object.ts uses, so `new Transfer(this)` inside a
// `cloudflare:workers` DurableObject subclass type-checks identically to the real lib.
import type { DurableObject } from 'cloudflare:workers';

type SqlStorageValue = ArrayBuffer | string | number | null;

export type RawFn = (
  query: string,
  ...bindings: any[]
) => Promise<{
  columnNames: string[];
  rowsRead: number;
  rowsWritten: number;
  raw: SqlStorageValue[][];
}>;

export type GetSchemaFn = () => Promise<string>;

export type ExecFn = (
  query: string,
  ...bindings: any[]
) => Promise<{
  columnNames: string[];
  rowsRead: number;
  rowsWritten: number;
  array: any[];
  one: any;
}>;

export type HandlerObject = {
  exec: ExecFn;
  raw: RawFn;
  getSchema: GetSchemaFn;
};

// queryable-object: QueryableHandler — used across the app in DO type
// intersections (`ZeroDriver & QueryableHandler`) so its members surface on stubs.
export class QueryableHandler {
  sql: SqlStorage | undefined;
  constructor(sql: SqlStorage | undefined);
  getSchema(): string;
  raw(
    query: string,
    ...bindings: any[]
  ): {
    columnNames: string[];
    rowsRead: number;
    rowsWritten: number;
    raw: SqlStorageValue[][];
  };
  exec(
    query: string,
    ...bindings: any[]
  ): {
    columnNames: string[];
    rowsRead: number;
    rowsWritten: number;
    array: any[];
    one: any;
  };
}

// queryable-object: class decorator, does not change the decorated class type.
export function Queryable(): <T extends { new (...args: any[]): any }>(
  constructor: T,
) => T;

// migratable-object
export interface MigratableOptions {
  migrations: Record<string, string[]>;
}
// class decorator, does not change the decorated class type.
export function Migratable(
  options: MigratableOptions,
): <T extends { new (...args: any[]): any }>(constructor: T) => T;

// transferable-object
export interface TransferableConfig {
  clearOnImport?: boolean;
  clearAfterExport?: boolean;
  basicAuth?: { username: string; password: string };
  dangerouslyDisableAuth?: boolean;
}
export interface ImportResult {
  success: boolean;
  tablesImported?: string[];
  error?: string;
}
export class Transfer {
  constructor(durableObject: DurableObject, config?: TransferableConfig);
  checkAuth(request: Request, requireAuth?: boolean): boolean;
  unauthorizedResponse(): Response;
  importFromUrl(url: string, authHeader?: string): Promise<ImportResult>;
  clear(): Promise<{ success: boolean; error?: string }>;
}

// multistub
export interface MultiStubConfig {
  name: string;
  jurisdiction?: DurableObjectJurisdiction;
  locationHint?: DurableObjectLocationHint;
}

// queryable-object: studio middleware options
export interface StudioOptions {
  basicAuth?: { username: string; password: string };
  dangerouslyDisableAuth?: boolean;
}
export interface StudioConfig extends StudioOptions {
  pathname?: string;
}

// dormroom mod.ts
export type DORMClient<T extends Rpc.DurableObjectBranded & QueryableHandler> = {
  stub: DurableObjectStub<T>;
  studio: (request: Request) => Promise<Response | undefined>;
  exec: ExecFn;
  raw: RawFn;
  getSchema: GetSchemaFn;
};

export function createClient<
  T extends Rpc.DurableObjectBranded & QueryableHandler,
>(context: {
  doNamespace: DurableObjectNamespace<T>;
  ctx: ExecutionContext;
  configs: MultiStubConfig[];
  studioConfig?: StudioConfig;
}): DORMClient<T>;

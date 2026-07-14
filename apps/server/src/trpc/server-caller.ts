import { getContext } from 'hono/context-storage';
import type { HonoContext } from '../ctx';
import { appRouter } from './index';

// Server-only tRPC caller (see `./index` for why it lives here — issue devlab-io/zero#43).
// `appRouter` is read from `./index` at call time (function body, not module load), so the
// index <-> server-caller cycle is inert.
export const serverTrpc = () => {
  const c = getContext<HonoContext>();
  // The real Hono context is a structural superset of the boundary context (issue #43);
  // hono's `Context` is invariant in its env generic, so cast through `unknown`. The
  // runtime object passed to the caller is unchanged from the original `serverTrpc`.
  const ctx = {
    c,
    sessionUser: c.var.sessionUser,
    auth: c.var.auth,
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
  return appRouter.createCaller(ctx);
};

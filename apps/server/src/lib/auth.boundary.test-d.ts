// Drift guard for the apps/mail `@zero/server/auth` boundary (issue devlab-io/zero#43).
//
// Enforced by `tsc --noEmit` (not run by vitest). `auth.boundary.d.ts` hand-declares the
// leaf `Auth` surface apps/mail consumes (only `api.getSession`'s return). This asserts the
// REAL better-auth session (from `createAuth().api.getSession`) is assignable to that shape —
// so the boundary can never claim a required field the real session does not provide. If
// better-auth's session shape changes incompatibly, the server typecheck fails here.
import type { Auth as BoundaryAuth } from './auth.boundary';
import type { createAuth } from './auth';

type RealSessionRet = Awaited<
  ReturnType<Awaited<ReturnType<typeof createAuth>>['api']['getSession']>
>;
type BoundarySessionRet = Awaited<ReturnType<BoundaryAuth['api']['getSession']>>;

// Real session (whatever better-auth infers) must satisfy the boundary view.
const _guard: BoundarySessionRet = null as unknown as RealSessionRet;
void _guard;

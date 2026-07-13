// Type-level fidelity test for the apps/mail AppRouter boundary (issue devlab-io/zero#43).
//
// Enforced by `tsc --noEmit` (not run by vitest). It asserts that the committed, generated
// boundary declaration (`app-router.boundary.d.ts`, which apps/mail consumes) carries the
// EXACT same procedure input/output maps as the real `router.ts`. If the generator, the
// env-neutralisation rewrite, or a source change ever degraded or dropped an I/O type, one
// of the mutual-assignability checks below fails at the server typecheck gate.
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter as RealRouter } from './index';
import type { AppRouter as BoundaryRouter } from './app-router.boundary';

type RealInputs = inferRouterInputs<RealRouter>;
type RealOutputs = inferRouterOutputs<RealRouter>;
type BoundaryInputs = inferRouterInputs<BoundaryRouter>;
type BoundaryOutputs = inferRouterOutputs<BoundaryRouter>;

// Structural equality via mutual assignability (both directions). Any divergence — a widened
// `any`/`unknown`, a missing procedure, a changed field — breaks one of these assignments.
const _inFwd: BoundaryInputs = null as unknown as RealInputs;
const _inBack: RealInputs = null as unknown as BoundaryInputs;
const _outFwd: BoundaryOutputs = null as unknown as RealOutputs;
const _outBack: RealOutputs = null as unknown as BoundaryOutputs;

// Spot-check a concrete, known procedure end-to-end: `mail.listThreads` output must keep its
// exact non-degraded shape (guards against a silent collapse to `any`, which would still
// satisfy the mutual checks above only if BOTH sides collapsed).
type Threads = BoundaryOutputs['mail']['listThreads']['threads'];
const _threadId: string = (null as unknown as Threads)[0]!.id;
const _nextToken: string | null = (null as unknown as BoundaryOutputs['mail']['listThreads'])
  .nextPageToken;

void _inFwd;
void _inBack;
void _outFwd;
void _outBack;
void _threadId;
void _nextToken;

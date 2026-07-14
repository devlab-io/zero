// Consumer-side proof that apps/mail sees exact procedure input/output types through the
// AppRouter boundary (issue devlab-io/zero#43). Enforced by `tsc --noEmit` (not run by
// vitest — the name does not match the `*.test.ts` glob). If the boundary ever degraded a
// procedure's types to `any`/`unknown`, the assignments below would fail.
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@zero/server/trpc';
import type { EPrompts } from '@zero/types';

type Inputs = inferRouterInputs<AppRouter>;
type Outputs = inferRouterOutputs<AppRouter>;

// brain.getPrompts — exact output type survives end-to-end (mutual assignability = equality).
const _prompts: Record<EPrompts, string> = null as unknown as Outputs['brain']['getPrompts'];
const _promptsBack: Outputs['brain']['getPrompts'] = null as unknown as Record<EPrompts, string>;

// mail.listThreads — exact input + output field types survive (this is the procedure whose
// `['~types']['output']` apps/mail's query-provider already relies on).
const _folder: string | undefined = (null as unknown as Inputs['mail']['listThreads']).folder;
const _threadId: string = (null as unknown as Outputs['mail']['listThreads']).threads[0]!.id;
const _next: string | null = (null as unknown as Outputs['mail']['listThreads']).nextPageToken;

void _prompts;
void _promptsBack;
void _folder;
void _threadId;
void _next;

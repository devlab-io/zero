import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';
import { cookiePreferencesRouter } from './routes/cookies';
import { connectionsRouter } from './routes/connections';
import { categoriesRouter } from './routes/categories';
import { templatesRouter } from './routes/templates';
import { shortcutRouter } from './routes/shortcut';
import { settingsRouter } from './routes/settings';
import { loggingRouter } from './routes/logging';
import { copilotRouter } from './routes/copilot';
import { outboxRouter } from './routes/outbox';
import { draftsRouter } from './routes/drafts';
import { labelsRouter } from './routes/label';
import { teamsRouter } from './routes/teams';
import { notesRouter } from './routes/notes';
import { brainRouter } from './routes/brain';
import { userRouter } from './routes/user';
import { meetRouter } from './routes/meet';
import { mailRouter } from './routes/mail';
import { bimiRouter } from './routes/bimi';
import { aiRouter } from './routes/ai';
import { router } from './trpc';

export const appRouter = router({
  ai: aiRouter,
  copilot: copilotRouter,
  bimi: bimiRouter,
  brain: brainRouter,
  categories: categoriesRouter,
  connections: connectionsRouter,
  cookiePreferences: cookiePreferencesRouter,
  drafts: draftsRouter,
  labels: labelsRouter,
  mail: mailRouter,
  notes: notesRouter,
  outbox: outboxRouter,
  shortcut: shortcutRouter,
  settings: settingsRouter,
  user: userRouter,
  teams: teamsRouter,
  templates: templatesRouter,
  meet: meetRouter,
  logging: loggingRouter,
});

export type AppRouter = typeof appRouter;

export type Inputs = inferRouterInputs<AppRouter>;
export type Outputs = inferRouterOutputs<AppRouter>;

// The server-only `serverTrpc` caller lives in `./server-caller` so THIS module's
// declaration stays emittable to the apps/mail type boundary (issue devlab-io/zero#43):
// `appRouter.createCaller(...)`'s inferred type references non-portable @trpc/server
// internals (TS2742) and would block the declaration. Re-exported here so the public
// `@zero/server/trpc` module contract is unchanged. The generator drops this single
// re-export line from the boundary (apps/mail never calls it). See ADR 0006.
export { serverTrpc } from './server-caller';

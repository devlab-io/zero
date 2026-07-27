import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';
import { cookiePreferencesRouter } from './routes/cookies';
import { connectionsRouter } from './routes/connections';
import { categoriesRouter } from './routes/categories';
import { templatesRouter } from './routes/templates';
import { shortcutRouter } from './routes/shortcut';
import { settingsRouter } from './routes/settings';
import { loggingRouter } from './routes/logging';
import { outboxRouter } from './routes/outbox';
import { draftsRouter } from './routes/drafts';
import { labelsRouter } from './routes/label';
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
  templates: templatesRouter,
  meet: meetRouter,
  logging: loggingRouter,
});

export type AppRouter = typeof appRouter;

export type Inputs = inferRouterInputs<AppRouter>;
export type Outputs = inferRouterOutputs<AppRouter>;

// Note (pitbull A8, axe 1) : ce module réexportait `serverTrpc` depuis `./server-caller`,
// qui lui-même importe `appRouter` d'ici — un cycle d'imports de valeur entre le routeur
// applicatif et son caller. Le caller n'avait AUCUN consommateur dans tout le dépôt (grep
// exécuté sur apps/ et packages/) : il a été supprimé plutôt que déplacé. Un appel
// serveur-à-serveur reste à une ligne — `appRouter.createCaller(ctx)` — et ADR 0006 porte
// la trace de cette décision.

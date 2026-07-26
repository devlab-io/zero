// workflows/sync-coordinator-utils.ts — décisions extraites du coordinateur de
// synchronisation (`sync-threads-coordinator-workflow.ts`), rendues testables.
//
// Deux défauts vivaient dans la boucle de sondage du coordinateur :
//
//  (a) ÉCHEC MASQUÉ. Le `throw` de la branche `status === 'errored'` était à l'intérieur
//      du `try` dont le `catch` ne relançait QUE si la deadline était dépassée. Un échec
//      de page était donc avalé : la boucle continuait à sonder pendant cinq minutes, puis
//      remontait « timed out » — un message faux, qui envoyait l'exploitation chercher un
//      problème de lenteur là où il y avait une erreur franche, cinq minutes plus tôt.
//      `classifyPageStatus` sépare désormais l'état TERMINAL de l'état transitoire, et le
//      terminal sort de la boucle immédiatement, avec son vrai motif.
//
//  (b) REJEU NON IDEMPOTENT. `step.do(...)` appelait `SYNC_THREADS_WORKFLOW.create({params})`
//      SANS `id`. Cloudflare Workflows retente un step échoué : chaque tentative créait donc
//      une NOUVELLE instance enfant, et la page entière était re-synchronisée — travail
//      Gmail dupliqué, écritures dupliquées, quota consommé deux fois. `childWorkflowId`
//      donne un identifiant déterministe par (instance coordinatrice, dossier, page) et
//      `createOrAttachPageWorkflow` se RATTACHE à l'instance existante quand elle est déjà
//      là, au lieu d'en ouvrir une seconde.

/** Alphabet accepté pour un identifiant d'instance Workflow. */
const ID_SAFE = /[^a-zA-Z0-9_-]/g;
/** Marge sous la limite d'identifiant côté Workflows. */
const MAX_ID_LENGTH = 64;

/**
 * Identifiant déterministe d'une page enfant. Stable sur toutes les tentatives d'un même
 * step (c'est le point), distinct d'une exécution de coordinateur à l'autre (l'instance
 * coordinatrice entre dans la clé), sans quoi une seconde synchronisation du même dossier
 * se heurterait à un identifiant déjà pris.
 */
export function childWorkflowId(
  coordinatorInstanceId: string,
  folder: string,
  pageNumber: number,
): string {
  const safeFolder = folder.replace(ID_SAFE, '-').slice(0, 16);
  const suffix = `-${safeFolder}-p${pageNumber}`;
  const head = coordinatorInstanceId.replace(ID_SAFE, '-').slice(0, MAX_ID_LENGTH - suffix.length);
  return `${head}${suffix}`;
}

export interface PageWorkflowHandle<T = unknown> {
  id: string;
  status(): Promise<{ status: string; output?: T }>;
}

export interface PageWorkflowBinding<P, T = unknown> {
  create(options: { id: string; params: P }): Promise<PageWorkflowHandle<T>>;
  get(id: string): Promise<PageWorkflowHandle<T>>;
}

/**
 * Crée l'instance de page, ou se rattache à celle qui porte déjà cet identifiant. C'est ce
 * rattachement qui rend le step REJOUABLE : `create` lève quand l'identifiant existe, et
 * une seconde tentative doit surveiller le travail déjà lancé, pas en relancer un autre.
 */
export async function createOrAttachPageWorkflow<P, T = unknown>(
  binding: PageWorkflowBinding<P, T>,
  id: string,
  params: P,
): Promise<PageWorkflowHandle<T>> {
  try {
    return await binding.create({ id, params });
  } catch {
    return await binding.get(id);
  }
}

export type PageOutcome = 'complete' | 'terminal-failure' | 'pending';

/** États Workflows dont on ne revient pas : continuer à sonder ne peut rien changer. */
const TERMINAL_FAILURE_STATUSES = new Set(['errored', 'terminated', 'unknown']);

/** Sépare l'issue définitive d'une page de son état transitoire. */
export function classifyPageStatus(status: string): PageOutcome {
  if (status === 'complete') return 'complete';
  if (TERMINAL_FAILURE_STATUSES.has(status)) return 'terminal-failure';
  return 'pending';
}

export interface PollOptions {
  baseMs: number;
  maxMs: number;
  factor: number;
  budgetMs: number;
}

export const DEFAULT_PAGE_POLL: PollOptions = {
  baseMs: 250,
  maxMs: 5000,
  factor: 1.6,
  budgetMs: 5 * 60 * 1000,
};

/** Intervalle avant la tentative `attempt` (0-indexée) : exponentiel, plafonné. */
export function pollDelayMs(attempt: number, opts: PollOptions = DEFAULT_PAGE_POLL): number {
  return Math.min(opts.maxMs, Math.round(opts.baseMs * Math.pow(opts.factor, attempt)));
}

export interface PollDeps {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/**
 * Sonde une page jusqu'à son issue. Un état TERMINAL sort immédiatement en levant son vrai
 * motif ; une erreur de sondage est tolérée tant que le budget n'est pas épuisé ; « timed
 * out » n'est plus levé que lorsque c'est réellement le cas.
 */
export async function awaitPageCompletion<T>(
  instance: PageWorkflowHandle<T>,
  deps: PollDeps,
  opts: PollOptions = DEFAULT_PAGE_POLL,
): Promise<T | undefined> {
  const deadline = deps.now() + opts.budgetMs;
  let attempt = 0;

  while (deps.now() < deadline) {
    await deps.sleep(pollDelayMs(attempt, opts));

    let status: { status: string; output?: T };
    try {
      status = await instance.status();
    } catch (error) {
      // Une lecture d'état qui échoue est transitoire tant qu'il reste du budget.
      if (deps.now() >= deadline) throw error;
      attempt++;
      continue;
    }

    const outcome = classifyPageStatus(status.status);
    if (outcome === 'complete') return status.output;
    if (outcome === 'terminal-failure') {
      // Hors du `try` : ce throw etait avale par le catch ci-dessus, et la boucle
      // continuait cinq minutes avant de mentir « timed out ».
      throw new Error(`Workflow ${instance.id} failed (${status.status})`);
    }

    attempt++;
  }

  throw new Error(`Workflow ${instance.id} timed out`);
}

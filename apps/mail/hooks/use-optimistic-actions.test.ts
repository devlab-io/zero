import { describe, expect, it, vi, beforeEach } from 'vitest';

// --- Le hook est testé comme fonction (pas de @testing-library dans le repo). On mocke la
// SURFACE de hooks (react useCallback, jotai useAtom, react-query, nuqs, use-mail, tRPC,
// posthog, sonner, thread-actions, paraglide) → useOptimisticActions() s'exécute comme du
// code plat et renvoie ses callbacks. On exerce ensuite les VRAIS corps + le VRAI
// optimisticActionsManager. Déterministe, sans renderer.
//
// Tous les espions sont créés UNE fois dans vi.hoisted (références stables capturées par les
// factories de mock) ; on nettoie via clearAllMocks entre les tests. -------------------

const h = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() });
  return {
    // useAtom est appelé 3× dans un ORDRE FIXE : bgQueue, addOptimistic, removeOptimistic.
    atomCall: 0,
    setBackgroundQueue: vi.fn(),
    addOptimisticAction: vi.fn(() => 'opt-1'),
    removeOptimisticAction: vi.fn(),
    threadId: null as string | null,
    setThreadId: vi.fn(),
    setActiveReplyId: vi.fn(),
    mutationSpies: {} as Record<string, ReturnType<typeof vi.fn>>,
    refetchQueries: vi.fn(() => Promise.resolve(undefined)),
    invalidateQueries: vi.fn(() => Promise.resolve(undefined)),
    setQueriesData: vi.fn(),
    toast,
    capture: vi.fn(),
    moveThreadsTo: vi.fn(() => Promise.resolve(undefined)),
    setMail: vi.fn(),
  };
});

vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
}));
vi.mock('jotai', async (orig) => ({
  ...(await orig<typeof import('jotai')>()),
  useAtom: () => {
    const idx = h.atomCall++;
    if (idx === 0) return [undefined, h.setBackgroundQueue];
    if (idx === 1) return [undefined, h.addOptimisticAction];
    if (idx === 2) return [undefined, h.removeOptimisticAction];
    return [undefined, () => {}];
  },
}));
vi.mock('@/store/backgroundQueue', () => ({ backgroundQueueAtom: { __bg: true } }));
vi.mock('nuqs', () => ({
  useQueryState: (key: string) => {
    if (key === 'threadId') return [h.threadId, h.setThreadId];
    if (key === 'activeReplyId') return [null, h.setActiveReplyId];
    return [null, () => {}];
  },
}));
vi.mock('@/components/mail/use-mail', () => ({
  useMail: () => [{ bulkSelected: [] }, h.setMail],
}));
vi.mock('@/lib/thread-actions', () => ({ moveThreadsTo: h.moveThreadsTo }));
vi.mock('@/paraglide/messages', () => ({ m: new Proxy({}, { get: () => () => 'msg' }) }));
vi.mock('posthog-js', () => ({ default: { capture: h.capture } }));
vi.mock('sonner', () => ({ toast: h.toast }));

function trpcProxy(path = ''): any {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'mutationOptions') return () => ({ __key: path.replace(/^\./, '') });
      if (prop === 'queryKey') return () => [path];
      if (prop === 'infiniteQueryKey')
        return (input?: unknown) => [path, { input, type: 'infinite' }];
      return trpcProxy(`${path}.${String(prop)}`);
    },
    apply: () => ({}),
  });
}
vi.mock('@/providers/query-provider', () => ({ useTRPC: () => trpcProxy() }));
vi.mock('@tanstack/react-query', () => ({
  useMutation: (opts: { __key?: string }) => {
    const key = opts?.__key ?? 'unknown';
    h.mutationSpies[key] ??= vi.fn().mockResolvedValue(undefined);
    return { mutateAsync: h.mutationSpies[key] };
  },
  useQueryClient: () => ({
    refetchQueries: h.refetchQueries,
    invalidateQueries: h.invalidateQueries,
    setQueriesData: h.setQueriesData,
  }),
}));

const { useOptimisticActions } = await import('./use-optimistic-actions');
const { optimisticActionsManager } = await import('@/lib/optimistic-actions-manager');

const flush = () => new Promise((r) => setTimeout(r, 0));
// Reset le compteur d'ordre useAtom juste avant chaque invocation du hook.
const hook = () => {
  h.atomCall = 0;
  return useOptimisticActions();
};
const lastToastOpts = () => (h.toast as any).mock.calls[0][1];

beforeEach(() => {
  vi.clearAllMocks();
  h.addOptimisticAction.mockReturnValue('opt-1');
  h.refetchQueries.mockResolvedValue(undefined);
  h.invalidateQueries.mockResolvedValue(undefined);
  h.moveThreadsTo.mockResolvedValue(undefined);
  h.threadId = null;
  h.atomCall = 0;
  for (const k of Object.keys(h.mutationSpies)) delete h.mutationSpies[k];
  optimisticActionsManager.pendingActions.clear();
  optimisticActionsManager.pendingActionsByType.clear();
  optimisticActionsManager.lastActionId = null;
});

describe('useOptimisticActions — garde-fous', () => {
  it('no-op sur liste de fils vide', () => {
    const a = hook();
    a.optimisticMarkAsRead([]);
    a.optimisticToggleStar([], true);
    a.optimisticMoveThreadsTo([], 'inbox', 'archive');
    expect(h.addOptimisticAction).not.toHaveBeenCalled();
  });

  it('optimisticToggleLabel : no-op sans labelId', () => {
    hook().optimisticToggleLabel(['t1'], '', true);
    expect(h.addOptimisticAction).not.toHaveBeenCalled();
  });

  it('optimisticDeleteDraft : no-op sans id', () => {
    hook().optimisticDeleteDraft('');
    expect(h.addOptimisticAction).not.toHaveBeenCalled();
  });
});

describe('useOptimisticActions — markAsRead (silent = exécution directe)', () => {
  it('enregistre l’action optimiste, exécute la mutation, capture posthog, nettoie', async () => {
    const a = hook();
    a.optimisticMarkAsRead(['t1'], true); // silent → doAction() direct (pas de toast)
    expect(h.addOptimisticAction).toHaveBeenCalledWith({
      type: 'READ',
      threadIds: ['t1'],
      read: true,
    });
    await flush();
    expect(h.mutationSpies['mail.markAsRead']).toHaveBeenCalledWith({ ids: ['t1'] });
    expect(h.capture).toHaveBeenCalledWith('email_marked_read');
    // Post-#34 : `isLastPendingOfType` capture la taille du set AVANT la suppression → une
    // action unique EST la dernière de son type → le refresh du chemin succès s'exécute
    // (bug détecté par #35, fix livré par #34, cf. lib/optimistic-recovery.ts). Avant #34
    // cette branche était morte.
    expect(h.refetchQueries).toHaveBeenCalled();
    expect(h.removeOptimisticAction).toHaveBeenCalledWith('opt-1');
    expect(optimisticActionsManager.pendingActions.size).toBe(0);
  });

  it('chemin d’erreur (post-#34) : undo + réconciliation liste + toast.error avec action Retry', async () => {
    h.mutationSpies['mail.markAsRead'] = vi.fn().mockRejectedValue(new Error('net'));
    const a = hook();
    a.optimisticMarkAsRead(['t1'], true); // silent → doAction() direct
    await flush();
    // undo() du chemin READ retire l'action optimiste (au lieu de l'ancien appel direct)
    expect(h.removeOptimisticAction).toHaveBeenCalledWith('opt-1');
    // réconciliation « failure-only » : invalidation de la liste des fils (issue #34)
    expect(h.invalidateQueries).toHaveBeenCalled();
    // toast d'échec porteur d'une action de récupération (Retry) — plus l'ancien 'Action failed' nu
    expect(h.toast.error).toHaveBeenCalledTimes(1);
    const [msg, opts] = (h.toast.error as any).mock.calls[0];
    expect(typeof msg).toBe('string');
    expect(opts.action).toMatchObject({ label: expect.any(String), onClick: expect.any(Function) });
    expect(opts.duration).toBeGreaterThan(0);
    expect(optimisticActionsManager.pendingActions.size).toBe(0);
    // Retry ré-applique l'intention → une nouvelle action optimiste READ est créée
    h.addOptimisticAction.mockClear();
    opts.action.onClick();
    expect(h.addOptimisticAction).toHaveBeenCalledWith({
      type: 'READ',
      threadIds: ['t1'],
      read: true,
    });
    await flush(); // laisse retomber le doAction de la nouvelle tentative (échoue aussi)
  });
});

describe('useOptimisticActions — toast : auto-close vs undo', () => {
  it('auto-close déclenche l’exécution', async () => {
    const a = hook();
    a.optimisticMarkAsRead(['t1']); // non silent → toast
    expect(h.toast).toHaveBeenCalledTimes(1);
    const opts = lastToastOpts();
    expect(opts.action.label).toBe('Undo');
    await opts.onAutoClose();
    await flush();
    expect(h.mutationSpies['mail.markAsRead']).toHaveBeenCalled();
  });

  it('bouton Undo annule sans exécuter la mutation', async () => {
    const a = hook();
    a.optimisticMarkAsRead(['t1']);
    lastToastOpts().action.onClick();
    expect(h.removeOptimisticAction).toHaveBeenCalledWith('opt-1');
    expect(optimisticActionsManager.pendingActions.size).toBe(0);
    await flush();
    expect(h.mutationSpies['mail.markAsRead']).not.toHaveBeenCalled();
  });

  it('message pluralisé pour une sélection multiple', () => {
    hook().optimisticMarkAsRead(['t1', 't2', 't3']);
    expect((h.toast as any).mock.calls[0][0]).toContain('(3 items)');
  });
});

describe('useOptimisticActions — variantes d’actions', () => {
  it('markAsUnread → mutation markAsUnread + action READ:false', async () => {
    hook().optimisticMarkAsUnread(['t1']);
    await lastToastOpts().onAutoClose();
    await flush();
    expect(h.addOptimisticAction).toHaveBeenCalledWith({
      type: 'READ',
      threadIds: ['t1'],
      read: false,
    });
    expect(h.mutationSpies['mail.markAsUnread']).toHaveBeenCalledWith({ ids: ['t1'] });
    expect(h.capture).toHaveBeenCalledWith('email_marked_unread');
  });

  it('toggleStar (starred) → event email_starred', async () => {
    hook().optimisticToggleStar(['t1'], true);
    await lastToastOpts().onAutoClose();
    await flush();
    expect(h.mutationSpies['mail.toggleStar']).toHaveBeenCalledWith({ ids: ['t1'] });
    expect(h.capture).toHaveBeenCalledWith('email_starred');
  });

  it('toggleImportant (false) → event email_unmarked_important', async () => {
    hook().optimisticToggleImportant(['t1'], false);
    await lastToastOpts().onAutoClose();
    await flush();
    expect(h.mutationSpies['mail.toggleImportant']).toHaveBeenCalledWith({ ids: ['t1'] });
    expect(h.capture).toHaveBeenCalledWith('email_unmarked_important');
  });

  it('toggleLabel (add) → modifyLabels avec addLabels', async () => {
    hook().optimisticToggleLabel(['t1'], 'LBL', true);
    await lastToastOpts().onAutoClose();
    await flush();
    expect(h.mutationSpies['mail.modifyLabels']).toHaveBeenCalledWith({
      threadId: ['t1'],
      addLabels: ['LBL'],
      removeLabels: [],
    });
    expect(h.capture).toHaveBeenCalledWith('email_label_added');
  });

  it('moveThreadsTo → thread-actions + file de fond + ferme le fil ouvert', async () => {
    h.threadId = 't1';
    const a = hook();
    a.optimisticMoveThreadsTo(['t1'], 'inbox', 'archive');
    expect(h.setBackgroundQueue).toHaveBeenCalledWith({ type: 'add', threadId: 'thread:t1' });
    expect(h.setThreadId).toHaveBeenCalledWith(null); // fil ouvert refermé
    await lastToastOpts().onAutoClose();
    await flush();
    expect(h.moveThreadsTo).toHaveBeenCalledWith({
      threadIds: ['t1'],
      currentFolder: 'inbox',
      destination: 'archive',
    });
    expect(h.capture).toHaveBeenCalledWith('email_moved');
  });

  it('deleteThreads → bulkDelete', async () => {
    hook().optimisticDeleteThreads(['t1'], 'inbox');
    await lastToastOpts().onAutoClose();
    await flush();
    expect(h.mutationSpies['mail.bulkDelete']).toHaveBeenCalledWith({ ids: ['t1'] });
  });

  it('snooze → mutation snoozeThreads(wakeAt ISO)', async () => {
    const wake = new Date(Date.now() + 3_600_000);
    hook().optimisticSnooze(['t1'], 'inbox', wake);
    await lastToastOpts().onAutoClose();
    await flush();
    expect(h.mutationSpies['mail.snoozeThreads']).toHaveBeenCalledWith({
      ids: ['t1'],
      wakeAt: wake.toISOString(),
    });
    expect(h.capture).toHaveBeenCalledWith('email_snoozed');
  });

  it('unsnooze → mutation unsnoozeThreads', async () => {
    hook().optimisticUnsnooze(['t1'], 'snoozed');
    await lastToastOpts().onAutoClose();
    await flush();
    expect(h.mutationSpies['mail.unsnoozeThreads']).toHaveBeenCalledWith({ ids: ['t1'] });
    expect(h.capture).toHaveBeenCalledWith('email_unsnoozed');
  });

  it('deleteDrafts → une mutation groupée + prune de tous les ids + invalidation', async () => {
    hook().optimisticDeleteDrafts(['draft-1', 'draft-2', 'draft-1']);
    await lastToastOpts().onAutoClose();
    await flush();
    expect(h.mutationSpies['drafts.deleteMany']).toHaveBeenCalledWith({
      ids: ['draft-1', 'draft-2'],
    });
    // Le compteur partagé baisse immédiatement, puis la ligne est PURGÉE des
    // pages en cache (identifiant exact). Portée de la purge : uniquement les
    // infinite queries du dossier draft — jamais inbox/sent.
    expect(h.setQueriesData).toHaveBeenCalledTimes(2);
    expect(h.setQueriesData.mock.calls[0][0]).toEqual({
      queryKey: ['.mail.mailboxOverview'],
    });
    expect(h.setQueriesData.mock.calls[1][0]).toEqual({
      queryKey: ['.mail.listThreads', { input: { folder: 'draft' }, type: 'infinite' }],
    });
    const updater = h.setQueriesData.mock.calls[1][1] as (
      data: { pages: { threads: { id: string }[] }[] } | undefined,
    ) => unknown;
    expect(
      updater({
        pages: [{ threads: [{ id: 'draft-1' }, { id: 'draft-2' }, { id: 'autre' }] }],
      }),
    ).toEqual({
      pages: [{ threads: [{ id: 'autre' }] }],
    });
    expect(h.invalidateQueries).toHaveBeenCalled();
    expect(h.capture).toHaveBeenCalledWith('draft_deleted');
  });

  it('découpe plus de 100 brouillons sans perdre la sélection globale', async () => {
    const ids = Array.from({ length: 205 }, (_, index) => `draft-${index + 1}`);
    hook().optimisticDeleteDrafts(ids);
    await lastToastOpts().onAutoClose();
    await flush();

    const calls = h.mutationSpies['drafts.deleteMany'].mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]?.[0].ids).toHaveLength(100);
    expect(calls[1]?.[0].ids).toHaveLength(100);
    expect(calls[2]?.[0].ids).toEqual(ids.slice(200));
  });
});

describe('useOptimisticActions — undoLastAction', () => {
  it('annule la dernière action en attente et vide le registre', () => {
    const a = hook();
    a.optimisticMarkAsRead(['t1']); // crée une action en attente (toast, pas encore auto-close)
    expect(optimisticActionsManager.lastActionId).not.toBeNull();
    expect(optimisticActionsManager.pendingActions.size).toBe(1);

    a.undoLastAction();
    expect(h.removeOptimisticAction).toHaveBeenCalledWith('opt-1'); // via l’undo enregistré
    expect(optimisticActionsManager.pendingActions.size).toBe(0);
    expect(optimisticActionsManager.lastActionId).toBeNull();
  });

  it('no-op quand il n’y a aucune dernière action', () => {
    expect(() => hook().undoLastAction()).not.toThrow();
  });
});

describe('optimisticMoveThreadsTo — keepThreadOpen (CUA 2026-07-30, échec 4)', () => {
  it('fil ouvert archivé sans option → la vue se ferme (comportement historique)', () => {
    h.threadId = 't1';
    const a = hook();
    a.optimisticMoveThreadsTo(['t1'], 'inbox', 'archive');
    expect(h.setThreadId).toHaveBeenCalledWith(null);
    expect(h.setActiveReplyId).toHaveBeenCalledWith(null);
  });

  it('keepThreadOpen : pas de fermeture — la navigation pose le threadId suivant elle-même', () => {
    h.threadId = 't1';
    const a = hook();
    a.optimisticMoveThreadsTo(['t1'], 'inbox', 'archive', { keepThreadOpen: true });
    expect(h.setThreadId).not.toHaveBeenCalled();
    // Le reply inline du fil archivé est bien nettoyé malgré la vue tenue ouverte.
    expect(h.setActiveReplyId).toHaveBeenCalledWith(null);
  });

  it('fil ouvert non concerné par le move → la vue reste intacte', () => {
    h.threadId = 'autre';
    const a = hook();
    a.optimisticMoveThreadsTo(['t1'], 'inbox', 'archive');
    expect(h.setThreadId).not.toHaveBeenCalled();
    expect(h.setActiveReplyId).not.toHaveBeenCalled();
  });
});

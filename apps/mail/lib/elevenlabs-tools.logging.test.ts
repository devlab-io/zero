import { beforeEach, describe, expect, it, vi } from 'vitest';

// pitbull (point 8b) — 14 blocs `catch` couvrant de VRAIES actions (envoi de mail,
// archivage, suppression) rendaient `{ success: false }` sans laisser la moindre trace :
// l'assistant vocal annonçait un échec, et rien côté journal ne permettait de savoir
// pourquoi. On journalise désormais avant de rendre l'échec ; la valeur de retour est
// inchangée, ce que ces tests vérifient explicitement.

vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/providers/query-provider', () => {
  // Toutes les routes tRPC rejettent : c'est le mode de panne réel (serveur en erreur,
  // réseau coupé) que chacun des 14 catch attrape.
  const boom = () => Promise.reject(new Error('boom: le serveur a refusé'));
  return {
    trpcClient: {
      mail: {
        listThreads: { query: boom },
        get: { query: boom },
        send: { mutate: boom },
        markAsRead: { mutate: boom },
        markAsUnread: { mutate: boom },
        bulkArchive: { mutate: boom },
        bulkDelete: { mutate: boom },
        modifyLabels: { mutate: boom },
      },
      labels: { create: { mutate: boom }, list: { query: boom } },
      ai: { webSearch: { mutate: boom } },
    },
  };
});

import { toolExecutors } from '@/lib/elevenlabs-tools';
import { log } from '@/lib/log';

/** Les exécuteurs qui lisent le threadId courant dans l'URL en ont besoin. */
function setCurrentThread(threadId: string | null) {
  const url = new URL(window.location.href);
  url.search = '';
  if (threadId) url.searchParams.set('threadId', threadId);
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  setCurrentThread('thread-1');
});

// Chaque entrée exerce un exécuteur distinct dont le catch était muet.
const cases: Array<[string, () => Promise<{ success: boolean }>]> = [
  ['listEmails', () => toolExecutors.listEmails({ folder: 'INBOX', query: '', maxResults: 5 })],
  ['getEmail', () => toolExecutors.getEmail({ threadId: 'thread-1' })],
  [
    'sendEmail',
    () =>
      toolExecutors.sendEmail({
        to: ['dest@example.com'],
        subject: 'S',
        message: 'M',
        threadId: 'thread-1',
      }),
  ],
  ['markAsRead', () => toolExecutors.markAsRead({ threadIds: ['t1'] })],
  ['markAsUnread', () => toolExecutors.markAsUnread({ threadIds: ['t1'] })],
  ['archiveEmails', () => toolExecutors.archiveEmails({ threadIds: ['t1'] })],
  ['deleteEmails', () => toolExecutors.deleteEmails({ threadIds: ['t1'] })],
  ['deleteEmail', () => toolExecutors.deleteEmail()],
  [
    'createLabel',
    () => toolExecutors.createLabel({ name: 'N', backgroundColor: '', textColor: '' }),
  ],
  ['applyLabel', () => toolExecutors.applyLabel({ label: 'N', threadIds: ['t1'] })],
  ['removeLabel', () => toolExecutors.removeLabel({ label: 'N', threadIds: ['t1'] })],
  ['searchEmails', () => toolExecutors.searchEmails({ question: 'facture' })],
  ['webSearch', () => toolExecutors.webSearch({ query: 'facture' })],
  ['summarizeEmail', () => toolExecutors.summarizeEmail()],
];

describe('toolExecutors — un échec tRPC laisse désormais une trace', () => {
  it.each(cases)("%s journalise l'erreur avant de rendre l'échec", async (_name, run) => {
    const result = await run();

    expect(result.success).toBe(false);
    expect(log.error).toHaveBeenCalled();
  });

  it("la valeur de retour n'a pas changé : { success, error } avec le message d'origine", async () => {
    const result = await toolExecutors.archiveEmails({ threadIds: ['t1'] });

    expect(result).toEqual({ success: false, error: 'boom: le serveur a refusé' });
  });

  it('les 14 exécuteurs couverts journalisent, aucun ne reste muet', async () => {
    for (const [, run] of cases) {
      vi.clearAllMocks();
      await run();
      expect(log.error).toHaveBeenCalled();
    }
    expect(cases).toHaveLength(14);
  });

  it('un refus métier sans exception (aucun thread ouvert) ne journalise pas à tort', async () => {
    setCurrentThread(null);
    const result = await toolExecutors.deleteEmail();

    expect(result.success).toBe(false);
    expect(log.error).not.toHaveBeenCalled();
  });
});

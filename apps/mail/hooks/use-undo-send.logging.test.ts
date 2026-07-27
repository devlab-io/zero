import { beforeEach, describe, expect, it, vi } from 'vitest';

// pitbull (point 4b) — les deux blocs `catch` du chemin d'annulation d'envoi différé
// étaient entièrement muets : l'utilisateur voyait « échec de l'annulation », le message
// partait quand même, et rien ne permettait de savoir pourquoi. Ce test emprunte le VRAI
// chemin : on récupère le `onClick` de l'action du toast et on le déclenche pendant que la
// mutation `mail.unsend` rejette, exactement comme un serveur qui refuse l'annulation.

vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const h = vi.hoisted(() => ({
  unsend: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: h.toastInfo },
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutateAsync: h.unsend }),
}));
vi.mock('@/providers/query-provider', () => ({
  useTRPC: () => ({ mail: { unsend: { mutationOptions: () => ({}) } } }),
}));

import { useUndoSend } from './use-undo-send';
import { log } from '@/lib/log';

type ToastAction = { action?: { onClick: () => Promise<void> | void } };

const settings = { settings: { undoSendEnabled: true } } as Parameters<
  ReturnType<typeof useUndoSend>['handleUndoSend']
>[1];

const emailData = {
  to: ['dest@example.com'],
  subject: 'Facture',
  message: 'Bonjour',
  attachments: [],
};

/**
 * Résultat réel de `mail.send` : un envoi mis en file, encore annulable pendant 15 s.
 * La forme doit satisfaire `isSendResult` (@/lib/email-utils), sinon aucun toast n'est émis.
 */
const sendResult = () => ({
  queued: true as const,
  messageId: 'msg-1',
  sendAt: Date.now() + 15_000,
});

/** Résultat réel de `mail.send` avec `scheduleAt` : envoi programmé par l'utilisateur. */
const scheduledResult = () => ({
  scheduled: true as const,
  messageId: 'msg-1',
  sendAt: Date.now() + 15_000,
});

function undoActionFromLastToast(): () => Promise<void> | void {
  const call = h.toastSuccess.mock.calls.at(-1);
  const options = call?.[1] as ToastAction | undefined;
  const onClick = options?.action?.onClick;
  if (!onClick) throw new Error('aucune action « annuler » rendue par le toast');
  return onClick;
}

/** Le composeur est rouvert par une réécriture d'URL : `isComposeOpen=true`. */
const composerReopened = () =>
  new URL(window.location.href).searchParams.get('isComposeOpen') === 'true';

beforeEach(() => {
  vi.clearAllMocks();
  h.unsend.mockRejectedValue(new Error('boom: annulation refusée'));
  localStorage.clear();
  window.history.replaceState({}, '', '/mail?activeReplyId=r1&draftId=d1');
});

describe("annulation d'un envoi immédiat qui échoue", () => {
  it("journalise la cause et signale l'échec à l'utilisateur", async () => {
    const { handleUndoSend } = useUndoSend();
    handleUndoSend(sendResult(), settings, emailData);

    await undoActionFromLastToast()();

    expect(log.error).toHaveBeenCalledWith(
      'Failed to undo send',
      expect.objectContaining({ messageId: 'msg-1' }),
    );
    expect(h.toastError).toHaveBeenCalled();
    expect(h.toastInfo).not.toHaveBeenCalled();
  });
});

describe("annulation d'un envoi programmé par l'utilisateur qui échoue", () => {
  it("journalise la cause et signale l'échec à l'utilisateur", async () => {
    const { handleUndoSend } = useUndoSend();
    handleUndoSend(scheduledResult(), settings, {
      ...emailData,
      scheduleAt: '2026-08-01T09:00:00Z',
    });

    await undoActionFromLastToast()();

    expect(log.error).toHaveBeenCalledWith(
      'Failed to cancel scheduled send',
      expect.objectContaining({ messageId: 'msg-1' }),
    );
    expect(h.toastError).toHaveBeenCalled();
  });
});

describe('chemin nominal — annulation réellement obtenue ({ success: true })', () => {
  it("ne journalise aucune erreur et confirme l'annulation de la planification", async () => {
    h.unsend.mockResolvedValue({ success: true });
    const { handleUndoSend } = useUndoSend();
    handleUndoSend(scheduledResult(), settings, {
      ...emailData,
      scheduleAt: '2026-08-01T09:00:00Z',
    });

    await undoActionFromLastToast()();

    expect(log.error).not.toHaveBeenCalled();
    expect(h.toastInfo).toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('rouvre le composeur avec le brouillon restauré sur le chemin « envoi immédiat »', async () => {
    h.unsend.mockResolvedValue({ success: true });
    const { handleUndoSend } = useUndoSend();
    handleUndoSend(sendResult(), settings, emailData);

    await undoActionFromLastToast()();

    expect(composerReopened()).toBe(true);
    expect(localStorage.getItem('undoEmailData')).not.toBeNull();
    expect(h.toastInfo).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });
});

// Nouveau contrat de `mail.unsend` : quand l'annulation arrive TROP TARD (envoi en vol ou
// déjà réglé), la procédure ne jette pas — elle rend `{ success: false, error }`. La
// promesse résout donc normalement, et le code d'avant annonçait « envoi annulé » puis
// rouvrait le composeur pour un mail qui était bel et bien parti.
describe('refus « trop tard » du serveur ({ success: false }) — la promesse résout', () => {
  const refusal = {
    success: false,
    error: 'Too late to cancel: the send is already in progress',
  };

  it("ne rouvre pas le composeur et n'écrit rien dans localStorage", async () => {
    h.unsend.mockResolvedValue(refusal);
    const { handleUndoSend } = useUndoSend();
    handleUndoSend(sendResult(), settings, emailData);

    await undoActionFromLastToast()();

    expect(composerReopened()).toBe(false);
    expect(localStorage.getItem('undoEmailData')).toBeNull();
  });

  it("affiche une ERREUR et jamais le message d'annulation, sur le chemin « envoi immédiat »", async () => {
    h.unsend.mockResolvedValue(refusal);
    const { handleUndoSend } = useUndoSend();
    handleUndoSend(sendResult(), settings, emailData);

    await undoActionFromLastToast()();

    expect(h.toastError).toHaveBeenCalled();
    expect(h.toastInfo).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      'Undo send refused',
      expect.objectContaining({ messageId: 'msg-1', reason: refusal.error }),
    );
  });

  it('affiche une ERREUR sur le chemin « envoi programmé », avec la raison du serveur', async () => {
    const settled = { success: false, error: 'Too late to cancel: the send already completed' };
    h.unsend.mockResolvedValue(settled);
    const { handleUndoSend } = useUndoSend();
    handleUndoSend(scheduledResult(), settings, {
      ...emailData,
      scheduleAt: '2026-08-01T09:00:00Z',
    });

    await undoActionFromLastToast()();

    expect(h.toastError).toHaveBeenCalled();
    expect(h.toastInfo).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      'Scheduled send cancellation refused',
      expect.objectContaining({ messageId: 'msg-1', reason: settled.error }),
    );
  });

  it('le refus est distingué du jet : deux messages de journal différents', async () => {
    h.unsend.mockResolvedValue(refusal);
    const { handleUndoSend } = useUndoSend();
    handleUndoSend(sendResult(), settings, emailData);
    await undoActionFromLastToast()();
    const refusedLog = vi.mocked(log.error).mock.calls.at(-1)?.[0];

    vi.clearAllMocks();
    h.unsend.mockRejectedValue(new Error('boom: réseau coupé'));
    handleUndoSend(sendResult(), settings, emailData);
    await undoActionFromLastToast()();
    const thrownLog = vi.mocked(log.error).mock.calls.at(-1)?.[0];

    expect(refusedLog).toBe('Undo send refused');
    expect(thrownLog).toBe('Failed to undo send');
  });
});

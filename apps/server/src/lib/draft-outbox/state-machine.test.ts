import {
  approveDraftOutboxItem,
  beginSendingDraftOutboxItem,
  cancelDraftOutboxItem,
  decideDraftOutboxSendSettlement,
  failDraftOutboxItem,
  markDraftOutboxItemSent,
  retryDraftOutboxItem,
  settleSendingDraftOutboxItem,
  type DraftOutboxItem,
} from './state-machine';
import {
  envelopedSendFailure,
  envelopedTransportFailure,
} from '../driver/__fixtures__/send-failure';
import { describe, expect, it } from 'vitest';

const baseItem = (overrides: Partial<DraftOutboxItem> = {}): DraftOutboxItem => ({
  id: 'outbox_1',
  connectionId: 'conn_1',
  threadId: null,
  mission: null,
  status: 'draft_ready',
  gmailDraftId: 'gmail_draft_1',
  subject: 'Subject',
  body: 'Body',
  idempotencyKey: 'idem_1',
  scheduledSendAt: null,
  error: null,
  createdAt: new Date('2026-07-06T00:00:00.000Z'),
  updatedAt: new Date('2026-07-06T00:00:00.000Z'),
  ...overrides,
});

describe('draft-outbox state machine guards', () => {
  it('rejects double-approve once an item is already approved', () => {
    const approved = baseItem({ status: 'approved', scheduledSendAt: new Date() });

    expect(() => approveDraftOutboxItem(approved)).toThrow(/draft_ready/);
  });

  it('allows cancellation during the countdown from approved', () => {
    const approved = baseItem({ status: 'approved', scheduledSendAt: new Date() });

    const cancelled = cancelDraftOutboxItem(approved);

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.scheduledSendAt).toBeNull();
  });

  it('allows retry from failed only', () => {
    const failed = baseItem({ status: 'failed', error: 'temporary failure' });

    expect(retryDraftOutboxItem(failed)).toMatchObject({
      status: 'queued',
      error: null,
      gmailDraftId: null,
      scheduledSendAt: null,
    });
    expect(() => retryDraftOutboxItem(baseItem({ status: 'draft_ready' }))).toThrow(/failed/);
  });

  it('prevents idempotent double-send with gmailDraftId plus terminal state guard', () => {
    const sending = beginSendingDraftOutboxItem(
      baseItem({ status: 'approved', gmailDraftId: 'gmail_draft_1' }),
    );
    const sent = markDraftOutboxItemSent(sending);

    expect(sent.status).toBe('sent');
    expect(sent.gmailDraftId).toBe('gmail_draft_1');
    expect(() => beginSendingDraftOutboxItem(sent)).toThrow(/terminal/);
  });
});

// ---------------------------------------------------------------------------
// Le rejeu d'un envoi POSSIBLEMENT ACCEPTÉ (constat 2).
//
// Chaîne réelle, sans aucune fixture inventée : les erreurs viennent de
// `../driver/__fixtures__/send-failure`, c'est-à-dire une VRAIE `GaxiosError` du paquet
// installé passée par la VRAIE enveloppe de production `StandardizedError` — celle que
// `GmailTransport.withErrorHandler` jette. `send-failure-envelope.test.ts` démontre que ce
// raccourci et le passage par le vrai `withErrorHandler` produisent la même valeur.
//
// Aucune frontière RPC ne s'interpose ici, contrairement à l'envoi différé :
// `sendDraftOutboxItem` s'exécute DANS le Durable Object, donc l'enveloppe que voit ce
// classement est bien celle-ci.
// ---------------------------------------------------------------------------

describe('sortie de `sending` — un envoi possiblement accepté n’est plus rejouable', () => {
  const sending = () => baseItem({ status: 'sending' });

  it('la voie GÉNÉRIQUE ne peut plus toucher un item en `sending`', () => {
    // C'est le verrou de fond : tant que `sending` figurait dans `failFromStatuses`,
    // n'importe quel appelant pouvait le rendre `failed`, donc rejouable, donc dupliqué.
    expect(() => failDraftOutboxItem(sending(), 'boom')).toThrow(/cannot fail item from sending/);
  });

  it('une coupure de TRANSPORT rend l’item `unresolved`, jamais `failed`', () => {
    const settled = settleSendingDraftOutboxItem(sending(), {
      error: 'socket hang up',
      failureClass: 'ambiguous',
    });
    expect(settled.status).toBe('unresolved');
    expect(settled.scheduledSendAt).toBeNull();
  });

  it('un refus PROUVÉ reste `failed`, donc rejouable', () => {
    for (const failureClass of ['not-accepted-retryable', 'not-accepted-permanent'] as const) {
      const settled = settleSendingDraftOutboxItem(sending(), { error: 'refus', failureClass });
      expect(settled.status).toBe('failed');
      expect(retryDraftOutboxItem(settled).status).toBe('queued');
    }
  });

  it('`unresolved` est TERMINAL : ni rejeu, ni annulation, ni renvoi', () => {
    const unresolved = settleSendingDraftOutboxItem(sending(), {
      error: 'socket hang up',
      failureClass: 'ambiguous',
    });

    // Le rejeu est la porte par laquelle passait le doublon : elle est fermée.
    expect(() => retryDraftOutboxItem(unresolved)).toThrow(/failed/);
    // L'annuler le présenterait comme non envoyé, ce qui est précisément inconnu.
    expect(() => cancelDraftOutboxItem(unresolved)).toThrow(/received unresolved/);
    // Et on ne peut pas le renvoyer directement non plus.
    expect(() => beginSendingDraftOutboxItem(unresolved)).toThrow(/terminal/);
    expect(() => markDraftOutboxItemSent(unresolved)).toThrow(/terminal/);
    // Ni le faire retomber dans la voie générique.
    expect(() => failDraftOutboxItem(unresolved, 'x')).toThrow(/cannot fail item from unresolved/);
  });
});

describe('decideDraftOutboxSendSettlement — nourri par la VRAIE enveloppe du driver', () => {
  it('un 429 de Gmail, ÉMIS, reste rejouable : le refus est prouvé', () => {
    expect(decideDraftOutboxSendSettlement('sending', envelopedSendFailure(429), true)).toEqual({
      action: 'settle-sending',
      failureClass: 'not-accepted-retryable',
    });
  });

  it('un 400 de Gmail, ÉMIS, est un refus définitif', () => {
    expect(decideDraftOutboxSendSettlement('sending', envelopedSendFailure(400), true)).toEqual({
      action: 'settle-sending',
      failureClass: 'not-accepted-permanent',
    });
  });

  it('une coupure de TRANSPORT après émission est AMBIGUË — le doublon exact qu’on ferme', () => {
    const decision = decideDraftOutboxSendSettlement('sending', envelopedTransportFailure(), true);
    expect(decision).toEqual({ action: 'settle-sending', failureClass: 'ambiguous' });

    // Bout en bout : cette décision aboutit à un état que l'utilisateur ne peut pas rejouer.
    const settled = settleSendingDraftOutboxItem(baseItem({ status: 'sending' }), {
      error: 'socket hang up',
      failureClass: decision.action === 'settle-sending' ? decision.failureClass : 'ambiguous',
    });
    expect(settled.status).toBe('unresolved');
    expect(() => retryDraftOutboxItem(settled)).toThrow(/failed/);
  });

  it('un 503 après émission est AMBIGU : Gmail a reçu la requête', () => {
    expect(decideDraftOutboxSendSettlement('sending', envelopedSendFailure(503), true)).toEqual({
      action: 'settle-sending',
      failureClass: 'ambiguous',
    });
  });

  it('un échec d’écriture APRÈS l’acceptation est ambigu, donc non rejouable', () => {
    // `markDraftOutboxJobSent` qui échoue signifie « le mail est parti, nous ne l'avons pas
    // noté ». L'erreur n'est pas une erreur d'envoi et ne porte aucun statut : elle doit
    // rester ambiguë, surtout pas rejouable.
    const dbError = new Error('Draft outbox item outbox_1 changed state; retry the transition');
    expect(decideDraftOutboxSendSettlement('sending', dbError, true)).toEqual({
      action: 'settle-sending',
      failureClass: 'ambiguous',
    });
  });

  it('un échec AVANT émission reste rejouable, quelle que soit la tête de l’erreur', () => {
    // `dispatched: false` : l'appelant SAIT qu'il n'avait pas atteint l'appel d'envoi (par
    // ex. la lecture du brouillon a échoué). Même philosophie que `SendNotDispatchedError`.
    expect(decideDraftOutboxSendSettlement('sending', envelopedTransportFailure(), false)).toEqual({
      action: 'settle-sending',
      failureClass: 'not-accepted-retryable',
    });
  });

  it('un item pas encore en `sending` suit la voie générique', () => {
    for (const status of ['queued', 'generating', 'draft_ready', 'approved'] as const) {
      expect(decideDraftOutboxSendSettlement(status, envelopedSendFailure(500), true)).toEqual({
        action: 'fail',
      });
    }
  });

  it('un item déjà terminal n’est plus touché', () => {
    for (const status of ['sent', 'cancelled', 'unresolved'] as const) {
      expect(decideDraftOutboxSendSettlement(status, envelopedSendFailure(500), true)).toEqual({
        action: 'ignore',
      });
    }
  });
});

import {
  draftListRow,
  matchesDraftSearch,
  moveDraftSelection,
  nextDraftAfterDeletion,
  selectDraftRange,
  shouldLoadNextDraftPage,
  stripDraftHtml,
  toggleDraftSelection,
  buildConfirmedDirectSend,
  canDirectSend,
  directSendClientId,
} from './draft-workspace-model';
import { describe, expect, it } from 'vitest';

describe('draft workspace model', () => {
  it('projects a fast row from the list payload without another fetch', () => {
    expect(
      draftListRow({
        id: 'd1',
        historyId: null,
        $raw: {
          to: [{ name: 'Alice', email: 'alice@example.com' }],
          subject: 'Project update',
          snippet: '<p>Hello <strong>Alice</strong></p>',
          receivedOn: '2026-08-01T08:00:00.000Z',
        },
      }),
    ).toEqual({
      id: 'd1',
      recipient: 'Alice',
      subject: 'Project update',
      preview: 'Hello Alice',
      receivedAt: Date.parse('2026-08-01T08:00:00.000Z'),
    });
  });

  it('strips unsafe markup for the read-only preview', () => {
    expect(stripDraftHtml('<style>x</style><p>Hello<br>world</p><script>bad()</script>')).toBe(
      'Hello\nworld',
    );
  });

  it('searches recipient, subject and preview', () => {
    const row = {
      id: 'd1',
      recipient: 'Alice',
      subject: 'Project update',
      preview: 'Ready for review',
      receivedAt: null,
    };
    expect(matchesDraftSearch(row, 'review')).toBe(true);
    expect(matchesDraftSearch(row, 'bob')).toBe(false);
  });

  it('loads the next provider page when bulk deletion empties only the current page', () => {
    expect(
      shouldLoadNextDraftPage({
        rowCount: 0,
        search: '',
        hasNextPage: true,
        isLoading: false,
        isFetchingNextPage: false,
      }),
    ).toBe(true);
    expect(
      shouldLoadNextDraftPage({
        rowCount: 0,
        search: '',
        hasNextPage: false,
        isLoading: false,
        isFetchingNextPage: false,
      }),
    ).toBe(false);
    expect(
      shouldLoadNextDraftPage({
        rowCount: 0,
        search: 'facture',
        hasNextPage: true,
        isLoading: false,
        isFetchingNextPage: false,
      }),
    ).toBe(false);
  });

  it('moves selection with clamped j/k semantics', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveDraftSelection(ids, null, 1)).toBe('a');
    expect(moveDraftSelection(ids, null, -1)).toBe('c');
    expect(moveDraftSelection(ids, 'b', 1)).toBe('c');
    expect(moveDraftSelection(ids, 'c', 1)).toBe('c');
    expect(moveDraftSelection(ids, 'a', -1)).toBe('a');
  });

  it('toggles individual drafts and extends a range without losing earlier choices', () => {
    const first = toggleDraftSelection(new Set<string>(), 'b');
    expect([...first]).toEqual(['b']);
    expect([...toggleDraftSelection(first, 'b')]).toEqual([]);

    const ranged = selectDraftRange(['a', 'b', 'c', 'd'], new Set(['a']), 'b', 'd');
    expect([...ranged]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps preview focus on the nearest surviving draft after a bulk deletion', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(nextDraftAfterDeletion(ids, 'b', new Set(['b', 'c']))).toBe('d');
    expect(nextDraftAfterDeletion(ids, 'd', new Set(['c', 'd']))).toBe('b');
    expect(nextDraftAfterDeletion(ids, 'a', new Set(['b', 'c']))).toBe('a');
    expect(nextDraftAfterDeletion(ids, 'a', new Set(ids))).toBeNull();
  });
});

describe('canDirectSend — envoi direct depuis le brouillon COMPLET seulement', () => {
  it('refuse tant que le brouillon complet n’est pas chargé', () => {
    expect(canDirectSend('d1', undefined)).toEqual({ ok: false, reason: 'not-loaded' });
    expect(canDirectSend('d1', null)).toEqual({ ok: false, reason: 'not-loaded' });
    expect(canDirectSend(null, { id: 'd1', to: ['a@b.pf'] })).toEqual({
      ok: false,
      reason: 'not-loaded',
    });
  });

  it('refuse un brouillon chargé qui ne correspond PAS à la ligne sélectionnée (jamais de row partielle)', () => {
    expect(canDirectSend('d1', { id: 'd2', to: ['a@b.pf'] })).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('refuse sans destinataire valide', () => {
    expect(canDirectSend('d1', { id: 'd1', to: [] })).toEqual({
      ok: false,
      reason: 'no-recipient',
    });
    expect(canDirectSend('d1', { id: 'd1', to: ['pas-un-email'] })).toEqual({
      ok: false,
      reason: 'no-recipient',
    });
  });

  it('accepte et extrait destinataires + sujet du brouillon complet', () => {
    expect(
      canDirectSend('d1', {
        id: 'd1',
        to: ['a@b.pf', 'x'],
        cc: ['c@b.pf'],
        bcc: ['b@b.pf'],
        subject: 'Devis',
      }),
    ).toEqual({
      ok: true,
      to: ['a@b.pf'],
      cc: ['c@b.pf'],
      bcc: ['b@b.pf'],
      subject: 'Devis',
    });
  });

  it('accepte un brouillon Cc/Bcc-only valide', () => {
    expect(canDirectSend('d1', { id: 'd1', to: [], cc: ['c@b.pf'], bcc: [] })).toMatchObject({
      ok: true,
      to: [],
      cc: ['c@b.pf'],
      bcc: [],
    });
  });

  it('ne construit aucune mutation avant confirmation explicite', () => {
    expect(buildConfirmedDirectSend(null, { id: 'd1', to: ['a@b.pf'], subject: 'S' })).toBeNull();
  });

  it('refuse une confirmation devenue obsolète après modification du brouillon', () => {
    expect(
      buildConfirmedDirectSend(
        { draftId: 'd1', to: ['a@b.pf'], cc: [], bcc: [], subject: 'Version A' },
        { id: 'd1', to: ['a@b.pf'], subject: 'Version B' },
      ),
    ).toBeNull();
  });

  it('produit une soumission confirmée stable et idempotente par draft', () => {
    const candidate = {
      draftId: 'd1',
      to: ['a@b.pf'],
      cc: ['c@b.pf'],
      bcc: ['b@b.pf'],
      subject: 'Devis',
    };
    const draft = {
      id: 'd1',
      to: ['a@b.pf'],
      cc: ['c@b.pf'],
      bcc: ['b@b.pf'],
      subject: 'Devis',
    };
    const first = buildConfirmedDirectSend(candidate, draft);
    const second = buildConfirmedDirectSend(candidate, draft);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      draftId: 'd1',
      sendAsStored: true,
      subject: 'Devis',
      message: '',
      to: [{ email: 'a@b.pf', name: 'a' }],
      cc: [{ email: 'c@b.pf', name: 'c' }],
      bcc: [{ email: 'b@b.pf', name: 'b' }],
    });
    expect(first?.clientSendId).toMatch(/^draft-direct-[a-z0-9]{8,}$/);
    expect(directSendClientId('d1')).not.toBe(directSendClientId('d2'));
  });
});

describe('buildConfirmedDirectSend — revalidation au moment de la confirmation', () => {
  const candidate = { draftId: 'd1', to: ['a@b.pf'], cc: [], bcc: [], subject: 'Devis' };

  it('reconstruit le payload depuis le brouillon COMPLET revalidé', () => {
    const out = buildConfirmedDirectSend(candidate, { id: 'd1', to: ['a@b.pf'], subject: 'Devis' });
    expect(out).toMatchObject({
      draftId: 'd1',
      sendAsStored: true,
      to: [{ email: 'a@b.pf', name: 'a' }],
      subject: 'Devis',
      message: '',
    });
    expect(out!.clientSendId).toBe(directSendClientId('d1'));
  });

  it('rejette un dialog périmé (destinataires ou sujet changés sous lui)', () => {
    expect(
      buildConfirmedDirectSend(candidate, { id: 'd1', to: ['autre@b.pf'], subject: 'Devis' }),
    ).toBeNull();
    expect(
      buildConfirmedDirectSend(candidate, { id: 'd1', to: ['a@b.pf'], subject: 'Changé' }),
    ).toBeNull();
    expect(buildConfirmedDirectSend(null, { id: 'd1', to: ['a@b.pf'] })).toBeNull();
  });

  it('clientSendId est DÉTERMINISTE par brouillon (retry/reload → même send_job)', () => {
    expect(directSendClientId('d1')).toBe(directSendClientId('d1'));
    expect(directSendClientId('d1')).not.toBe(directSendClientId('d2'));
    expect(directSendClientId('d1')).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });
});

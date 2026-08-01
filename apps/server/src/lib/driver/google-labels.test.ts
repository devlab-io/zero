import type { GmailTransport } from './google-transport';
import { describe, expect, it } from 'vitest';
import type { Label } from '../../types';

// google-labels ne dépend que de google-label-color-map + effect (purs). Aucune feuille
// lourde à neutraliser : on injecte directement le transport factice.
const { GmailLabels } = await import('./google-labels');
const { makeFakeTransport, makeFakeGmail, data, gmailError } = await import(
  './__fixtures__/google-http-fake'
);

const asT = (t: unknown) => t as unknown as GmailTransport;

describe('GmailLabels.count — agrégation Effect (labels + archive)', () => {
  it('compte par label (unread) sauf sent/drafts (total) + archive', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.list': () =>
          data({ labels: [{ id: 'INBOX' }, { id: 'SENT' }, { id: 'DRAFT' }] }),
        'users.threads.list': () => data({ resultSizeEstimate: 7 }), // archive
        'users.labels.get': (p) => {
          if (p.id === 'INBOX') return data({ name: 'Inbox', threadsUnread: 3, threadsTotal: 50 });
          if (p.id === 'SENT') return data({ name: 'Sent', threadsUnread: 0, threadsTotal: 10 });
          return data({ name: 'Draft', threadsUnread: 0, threadsTotal: 4 });
        },
      }),
    });
    const out = await new GmailLabels(asT(t)).count();
    expect(out).toEqual(
      expect.arrayContaining([
        { label: 'inbox', count: 3 }, // unread
        { label: 'sent', count: 10 }, // total
        { label: 'drafts', count: 4 }, // 'draft' renommé 'drafts' → total
        { label: 'archive', count: 7 },
      ]),
    );
  });

  it('échec de la liste des labels → rejette (Effect.tryPromise place l’échec sur le canal erreur)', async () => {
    // Comportement RÉEL : la branche `return []` sur LabelListFailed est inatteignable car
    // le catch de tryPromise fait ÉCHOUER l'Effect (court-circuit d'Effect.all).
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.list': gmailError('boom', 500),
        'users.threads.list': () => data({ resultSizeEstimate: 0 }),
      }),
    });
    await expect(new GmailLabels(asT(t)).count()).rejects.toThrow(/LabelListFailed/);
  });

  it('aucun label utilisateur → tableau vide', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.list': () => data({ labels: [] }),
        'users.threads.list': () => data({ resultSizeEstimate: 0 }),
      }),
    });
    await expect(new GmailLabels(asT(t)).count()).resolves.toEqual([]);
  });
});

describe('GmailLabels.getMailboxCounts', () => {
  it('fetches only the three core labels and always returns total threads', async () => {
    const requested: string[] = [];
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.get': (p) => {
          requested.push(String(p.id));
          if (p.id === 'INBOX') return data({ threadsUnread: 3, threadsTotal: 50 });
          if (p.id === 'DRAFT') return data({ threadsUnread: 0, threadsTotal: 4 });
          return data({ threadsUnread: 0, threadsTotal: 10 });
        },
      }),
    });

    await expect(new GmailLabels(asT(t)).getMailboxCounts()).resolves.toEqual({
      inbox: 50,
      drafts: 4,
      sent: 10,
    });
    expect(requested.sort()).toEqual(['DRAFT', 'INBOX', 'SENT']);
  });
});

describe('GmailLabels.getUserLabels / getLabel', () => {
  it('mappe les labels et remplace les null par des chaînes vides', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.list': () =>
          data({
            labels: [
              {
                id: 'l1',
                name: 'Projet',
                type: 'user',
                color: { backgroundColor: '#16a766', textColor: '#ffffff' },
              },
              { id: 'l2' }, // tout null
            ],
          }),
      }),
    });
    const out = await new GmailLabels(asT(t)).getUserLabels();
    expect(out[0]).toEqual({
      id: 'l1',
      name: 'Projet',
      type: 'user',
      color: { textColor: '#D1F0D9', backgroundColor: '#12341D' }, // mappé
    });
    // mapGoogleLabelColor({bg:'',text:''}) : garde bg/text falsy → renvoie l'objet vide tel quel.
    expect(out[1]).toEqual({
      id: 'l2',
      name: '',
      type: '',
      color: { backgroundColor: '', textColor: '' },
    });
  });

  it('getLabel renvoie un Label complet avec couleur mappée', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.get': () =>
          data({
            name: 'Clients',
            type: 'user',
            color: { backgroundColor: '#16a766', textColor: '#ffffff' },
          }),
      }),
    });
    const out = await new GmailLabels(asT(t)).getLabel('lX');
    expect(out).toEqual({
      id: 'lX',
      name: 'Clients',
      type: 'user',
      color: { textColor: '#D1F0D9', backgroundColor: '#12341D' },
    });
  });
});

describe('GmailLabels.createLabel / updateLabel / deleteLabel', () => {
  it('createLabel envoie visibilités + couleur convertie vers Gmail', async () => {
    let params: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.create': (p) => {
          params = p;
          return data({ id: 'new' });
        },
      }),
    });
    await new GmailLabels(asT(t)).createLabel({
      name: 'Devis',
      color: { backgroundColor: '#12341D', textColor: '#D1F0D9' },
    });
    const rb = params?.requestBody as {
      name?: string;
      labelListVisibility?: string;
      color?: unknown;
    };
    expect(rb?.name).toBe('Devis');
    expect(rb?.labelListVisibility).toBe('labelShow');
    expect(rb?.color).toEqual({ backgroundColor: '#16a766', textColor: '#ffffff' });
  });

  it('createLabel sans couleur → color undefined', async () => {
    let params: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.create': (p) => {
          params = p;
          return data({});
        },
      }),
    });
    await new GmailLabels(asT(t)).createLabel({ name: 'Sans couleur' });
    expect((params?.requestBody as { color?: unknown } | undefined)?.color).toBeUndefined();
  });

  it('updateLabel envoie id + nom + couleur convertie', async () => {
    let params: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.update': (p) => {
          params = p;
          return data({});
        },
      }),
    });
    const label: Label = {
      id: 'l1',
      name: 'Maj',
      color: { backgroundColor: '#12341D', textColor: '#D1F0D9' },
      type: 'user',
    };
    await new GmailLabels(asT(t)).updateLabel('l1', label);
    expect(params?.id).toBe('l1');
    expect((params?.requestBody as { color?: unknown } | undefined)?.color).toEqual({
      backgroundColor: '#16a766',
      textColor: '#ffffff',
    });
  });

  it('deleteLabel supprime par id', async () => {
    let params: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.delete': (p) => {
          params = p;
          return data({});
        },
      }),
    });
    await new GmailLabels(asT(t)).deleteLabel('lDel');
    expect(params?.id).toBe('lDel');
  });
});

describe('GmailLabels.modifyThreadLabels', () => {
  it('liste vide → aucun appel API', async () => {
    let modifyCalls = 0;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.threads.modify': () => {
          modifyCalls += 1;
          return data({});
        },
      }),
    });
    await new GmailLabels(asT(t)).modifyThreadLabels([], { addLabelIds: ['X'] });
    expect(modifyCalls).toBe(0);
  });

  it('applique le label à chaque fil (multi-chunks au-delà de 15)', async () => {
    const modified: string[] = [];
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.threads.modify': (p) => {
          modified.push(p.id as string);
          return data({});
        },
      }),
    });
    const ids = Array.from({ length: 16 }, (_, i) => `t${i}`); // 2 chunks (15 + 1)
    await new GmailLabels(asT(t)).modifyThreadLabels(ids, { addLabelIds: ['UNREAD'] });
    expect(modified.sort()).toEqual(ids.sort());
  });

  it('une modification en échec → rejette en propageant l’erreur du fil (message extrait)', async () => {
    // Comportement RÉEL : Effect.all court-circuite au 1er échec, donc modifyThreadLabels
    // rejette avec l'objet d'échec du fil (errorMessage = errors[0].message) plutôt que le
    // message d'agrégation « Failed to modify labels » (inatteignable dans ce chemin).
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.threads.modify': (p) => {
          if (p.id === 'bad') throw { errors: [{ message: 'quota' }] };
          return data({});
        },
      }),
    });
    await expect(
      new GmailLabels(asT(t)).modifyThreadLabels(['good', 'bad'], { addLabelIds: ['X'] }),
    ).rejects.toThrow(/"threadId":"bad"[\s\S]*"quota"/);
  });
});

describe('GmailLabels.modifyLabels — résolution des ids', () => {
  it('labels système résolus tels quels (forme tableau)', async () => {
    let modifyParams: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.threads.modify': (p) => {
          modifyParams = p;
          return data({});
        },
      }),
    });
    await new GmailLabels(asT(t)).modifyLabels(['t1'], ['INBOX'], ['SPAM']);
    expect(modifyParams?.requestBody).toEqual({ addLabelIds: ['INBOX'], removeLabelIds: ['SPAM'] });
  });

  it('label utilisateur inexistant → création puis résolution du nouvel id', async () => {
    let listCalls = 0;
    let createCalled = false;
    let modifyParams: Record<string, unknown> | undefined;
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.labels.list': () => {
          listCalls += 1;
          // 1er appel : label absent ; après création : présent.
          return listCalls === 1
            ? data({ labels: [] })
            : data({ labels: [{ id: 'Label_42', name: 'Projet', type: 'user' }] });
        },
        'users.labels.create': () => {
          createCalled = true;
          return data({ id: 'Label_42' });
        },
        'users.threads.modify': (p) => {
          modifyParams = p;
          return data({});
        },
      }),
    });
    await new GmailLabels(asT(t)).modifyLabels(['t1'], { addLabels: ['Projet'], removeLabels: [] });
    expect(createCalled).toBe(true);
    expect(modifyParams?.requestBody).toEqual({ addLabelIds: ['Label_42'], removeLabelIds: [] });
  });
});

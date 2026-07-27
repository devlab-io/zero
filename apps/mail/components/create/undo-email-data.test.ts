import { beforeEach, describe, expect, it, vi } from 'vitest';

// pitbull (point 6a) — `undoEmailData` était désérialisé sans validation de forme, puis
// `undoEmailData?.to?.join(',')` était évalué PENDANT le render de CreateEmail. Une valeur
// mal formée levait donc un TypeError en render, ce qui fait remplacer tout l'arbre par
// l'ErrorBoundary racine : composeur inaccessible, application décapitée.
//
// Les charges ci-dessous sont de VRAIES chaînes JSON écrites dans un vrai localStorage,
// telles qu'une clé corrompue en contient réellement (format d'une version antérieure,
// édition manuelle, écriture partielle). Aucune erreur n'est fabriquée.

// create-email.tsx tire l'éditeur, posthog, nuqs, l'auth-client et le client tRPC à
// l'import : même patron de stubs que root.test.tsx / mail-lazy-surfaces.test.tsx pour les
// voisins lourds, la lecture de localStorage testée ici n'en dépend pas.
vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/providers/query-provider', () => ({
  useTRPC: () => ({}),
  trpcClient: {},
}));
vi.mock('@/lib/auth-client', () => ({ useSession: () => ({ data: null }), signOut: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));
vi.mock('./email-composer', () => ({ EmailComposer: () => null }));

import { readUndoEmailData, UNDO_EMAIL_STORAGE_KEY } from './create-email';
import { log } from '@/lib/log';

/** Charge exacte écrite par use-undo-send (pièces jointes sérialisées en base64). */
const validPayload = {
  to: ['dest@example.com'],
  cc: ['copie@example.com'],
  bcc: undefined,
  subject: 'Facture 2026-07',
  message: '<p>Bonjour</p>',
  attachments: [
    {
      name: 'note.txt',
      size: 2,
      type: 'text/plain',
      lastModified: 1_700_000_000_000,
      data: 'aGk=',
    },
  ],
  fromEmail: 'moi@example.com',
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('readUndoEmailData — charge valide', () => {
  it('restitue les destinataires, le sujet, le corps et les pièces jointes désérialisées', () => {
    localStorage.setItem(UNDO_EMAIL_STORAGE_KEY, JSON.stringify(validPayload));

    const data = readUndoEmailData();

    expect(data).not.toBeNull();
    expect(data?.to).toEqual(['dest@example.com']);
    expect(data?.cc).toEqual(['copie@example.com']);
    expect(data?.subject).toBe('Facture 2026-07');
    expect(data?.attachments).toHaveLength(1);
    expect(data?.attachments[0]).toBeInstanceOf(File);
    expect(data?.attachments[0]?.name).toBe('note.txt');
    // la clé valide n'est pas purgée
    expect(localStorage.getItem(UNDO_EMAIL_STORAGE_KEY)).not.toBeNull();
  });

  it("accepte l'absence des champs optionnels (cc, bcc, fromEmail, scheduleAt)", () => {
    localStorage.setItem(
      UNDO_EMAIL_STORAGE_KEY,
      JSON.stringify({ to: ['a@b.co'], subject: 'S', message: 'M', attachments: [] }),
    );
    expect(readUndoEmailData()?.to).toEqual(['a@b.co']);
  });
});

describe('readUndoEmailData — charges corrompues (le render ne doit jamais lever)', () => {
  // `to` est le champ consommé en render par `undoEmailData?.to?.join(',')`.
  const corrupted: Array<[string, string]> = [
    // `"x@y.co".join` n'existe pas sur String : c'est exactement le TypeError du constat.
    ['`to` est une chaîne', '{"to":"x@y.co"}'],
    ['`to` est un objet', '{"to":{}}'],
    ['`to` contient des non-chaînes', '{"to":[1,2],"subject":"S","message":"M","attachments":[]}'],
    ['`to` est absent', '{"subject":"S","message":"M","attachments":[]}'],
    ['`subject` est un nombre', '{"to":["a@b.co"],"subject":7,"message":"M","attachments":[]}'],
    [
      "`attachments` n'est pas un tableau",
      '{"to":["a@b.co"],"subject":"S","message":"M","attachments":{}}',
    ],
    [
      'une pièce jointe est incomplète',
      '{"to":["a@b.co"],"subject":"S","message":"M","attachments":[{"name":"x"}]}',
    ],
    ['la charge est un tableau', '[]'],
    ['la charge est null', 'null'],
    ['la charge est une chaîne JSON', '"undoEmailData"'],
    ['le JSON est tronqué', '{"to":["a@b.co"'],
  ];

  it.each(corrupted)('rend null et purge la clé quand %s', (_label, raw) => {
    localStorage.setItem(UNDO_EMAIL_STORAGE_KEY, raw);

    expect(() => readUndoEmailData()).not.toThrow();
    expect(readUndoEmailData()).toBeNull();
    expect(localStorage.getItem(UNDO_EMAIL_STORAGE_KEY)).toBeNull();
  });

  it('la valeur exacte du constat ({"to":"x@y.co"}) ne peut plus produire de to.join', () => {
    localStorage.setItem(UNDO_EMAIL_STORAGE_KEY, '{"to":"x@y.co"}');
    const data = readUndoEmailData();
    // le render fait `undoEmailData?.to?.join(',')` : avec null, l'optional chaining court-circuite
    expect(data).toBeNull();
    expect(() => data?.to?.join(',')).not.toThrow();
  });

  it('journalise le rejet au lieu de le passer sous silence', () => {
    localStorage.setItem(UNDO_EMAIL_STORAGE_KEY, '{"to":{}}');
    readUndoEmailData();
    expect(log.error).toHaveBeenCalled();
  });

  it('base64 invalide dans une pièce jointe : atob lève, la lecture rend null et purge', () => {
    localStorage.setItem(
      UNDO_EMAIL_STORAGE_KEY,
      JSON.stringify({
        to: ['a@b.co'],
        subject: 'S',
        message: 'M',
        attachments: [
          {
            name: 'x',
            size: 1,
            type: 'text/plain',
            lastModified: 0,
            data: 'ceci n est pas du base64 !!',
          },
        ],
      }),
    );

    expect(() => readUndoEmailData()).not.toThrow();
    expect(readUndoEmailData()).toBeNull();
    expect(localStorage.getItem(UNDO_EMAIL_STORAGE_KEY)).toBeNull();
  });

  it("rend null sans purger quand aucune clé n'est stockée", () => {
    expect(readUndoEmailData()).toBeNull();
    expect(log.error).not.toHaveBeenCalled();
  });
});

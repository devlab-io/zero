import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver } from '@tanstack/react-query';

// pitbull (point 8a) — le `onError` global des mutations se contentait d'un
// `log.error(err.message)`. Une mutation qui échoue est une ACTION que l'utilisateur croit
// faite (envoi, archivage, suppression) : sans retour, l'échec est invisible. On vérifie ici
// contre le VRAI QueryClient de l'application, en faisant réellement échouer une mutation.

vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const h = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: h.error, success: h.success } }));

import { makeQueryClient, resolveMutationErrorToast } from '@/providers/query-provider';
import { log } from '@/lib/log';

type MutationOpts = ConstructorParameters<typeof MutationObserver>[1];

let client: ReturnType<typeof makeQueryClient>;

/** Fait échouer une vraie mutation à travers le client réel, options comprises. */
async function runFailingMutation(options: Partial<MutationOpts> = {}) {
  const observer = new MutationObserver(client, {
    mutationFn: () => Promise.reject(new Error('boom: le serveur a refusé')),
    ...options,
  });
  await observer.mutate(undefined).catch(() => undefined);
}

beforeEach(() => {
  client = makeQueryClient('test-owner');
  vi.clearAllMocks();
});

afterEach(() => {
  client.clear();
});

describe('échec de mutation — retour utilisateur', () => {
  it('émet un toast générique quand la mutation ne gère pas son erreur', async () => {
    await runFailingMutation();

    expect(h.error).toHaveBeenCalledTimes(1);
    expect(h.error).toHaveBeenCalledWith(expect.stringContaining('Error'));
  });

  it("journalise toujours, même quand aucun toast n'est émis", async () => {
    await runFailingMutation({ meta: { silentError: true } });

    expect(log.error).toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('`meta.errorMessage` remplace le message générique', async () => {
    await runFailingMutation({ meta: { errorMessage: 'Impossible de programmer cet envoi' } });

    expect(h.error).toHaveBeenCalledWith('Impossible de programmer cet envoi');
  });

  it("ne double pas le toast d'une mutation qui gère déjà son propre retour", async () => {
    const own = vi.fn();
    await runFailingMutation({ onError: own });

    expect(own).toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it("`meta.errorMessage` l'emporte même si la mutation déclare un onError", async () => {
    await runFailingMutation({ onError: vi.fn(), meta: { errorMessage: 'Envoi refusé' } });

    expect(h.error).toHaveBeenCalledWith('Envoi refusé');
  });

  it("n'émet rien quand la mutation réussit", async () => {
    const observer = new MutationObserver(client, { mutationFn: () => Promise.resolve('ok') });
    await observer.mutate();

    expect(h.error).not.toHaveBeenCalled();
  });
});

describe('resolveMutationErrorToast — table de précédence', () => {
  // `mutation` réduite à ce que la règle lit réellement : ses options.
  const withOptions = (options: Record<string, unknown>) =>
    ({ options }) as unknown as Parameters<typeof resolveMutationErrorToast>[0];

  it('silentError gagne sur tout', () => {
    expect(
      resolveMutationErrorToast(
        withOptions({ meta: { silentError: true, errorMessage: 'ignoré' } }),
        'générique',
      ),
    ).toBeNull();
  });

  it('errorMessage gagne sur le onError propre à la mutation', () => {
    expect(
      resolveMutationErrorToast(
        withOptions({ meta: { errorMessage: 'précis' }, onError: () => undefined }),
        'générique',
      ),
    ).toBe('précis');
  });

  it('un onError propre suffit à couper le toast générique', () => {
    expect(
      resolveMutationErrorToast(withOptions({ onError: () => undefined }), 'générique'),
    ).toBeNull();
  });

  it('sans meta ni onError, le message générique est rendu', () => {
    expect(resolveMutationErrorToast(withOptions({}), 'générique')).toBe('générique');
  });

  it('une mutation absente retombe sur le message générique', () => {
    expect(resolveMutationErrorToast(undefined, 'générique')).toBe('générique');
  });
});

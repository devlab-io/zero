import {
  createPredictionRegistry,
  deterministicProvider,
  phraseBank,
  PredictionSession,
  rankCandidates,
  type PredictionContext,
} from './compose-prediction';
import { describe, expect, it } from 'vitest';

const ctx = (currentLine: string, fullText = currentLine): PredictionContext => ({
  currentLine,
  fullText,
});

describe('rankCandidates — pur, non-mutant', () => {
  const bank = phraseBank('fr', { myName: 'Thomas' });

  it('complète un préfixe strict, la plus courte d’abord', () => {
    const suggestion = rankCandidates(bank, ctx('Merci pour votre r'), new Set());
    expect(suggestion).toBe('Merci pour votre retour.');
  });

  it('moins de 2 caractères : jamais de suggestion', () => {
    expect(rankCandidates(bank, ctx('M'), new Set())).toBeNull();
  });

  it('une phrase déjà utilisée ne revient pas', () => {
    const used = new Set(['Merci pour votre retour.']);
    expect(rankCandidates(bank, ctx('Merci pour votre r'), used)).toBe(
      'Merci pour votre message.'.startsWith('Merci pour votre r')
        ? 'Merci pour votre message.'
        : null,
    );
  });

  it('pas de re-salutation en milieu de mail', () => {
    const body = 'x'.repeat(120);
    expect(
      rankCandidates(bank, { currentLine: 'Bonjo', fullText: body + 'Bonjo' }, new Set()),
    ).toBeNull();
  });

  it('banque en : fonctionne et reste déterministe', () => {
    const en = phraseBank('en', { senderName: 'Olivier' });
    expect(rankCandidates(en, ctx('Hi Ol'), new Set())).toBe('Hi Olivier,');
  });
});

describe('PredictionSession — gardes anti-course', () => {
  it('une réponse PÉRIMÉE (frappe plus récente) est jetée', async () => {
    let release: (() => void) | null = null;
    const slowFirst = new Promise<void>((resolve) => (release = resolve));
    let call = 0;
    const session = new PredictionSession('owner-a', async () => {
      call += 1;
      if (call === 1) await slowFirst;
      return phraseBank('fr');
    });
    const first = session.request(ctx('Merci pour votre r'));
    const second = await session.request(ctx('Je reviens vers vous c'));
    expect(second.stale).toBe(false);
    expect(second.suggestion).toContain('Je reviens vers vous concernant');
    release!();
    const firstResult = await first;
    expect(firstResult.stale).toBe(true);
    expect(firstResult.suggestion).toBeNull();
  });

  it('dispose (changement de scope) : la requête en vol devient stale', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const session = new PredictionSession('owner-a', async () => {
      await gate;
      return phraseBank('fr');
    });
    const pending = session.request(ctx('Merci pour votre r'));
    session.dispose();
    release!();
    const result = await pending;
    expect(result.stale).toBe(true);
    expect(result.suggestion).toBeNull();
  });

  it('un provider qui échoue ne suggère rien (pas de crash, pas de stale)', async () => {
    const session = new PredictionSession('owner-a', async () => {
      throw new Error('network');
    });
    const result = await session.request(ctx('Merci pour votre r'));
    expect(result).toEqual({ suggestion: null, stale: false });
  });
});

describe('createPredictionRegistry — isolation par owner', () => {
  it('changer d’ownerKey élimine la session précédente et oublie les phrases utilisées', async () => {
    const registry = createPredictionRegistry(() => deterministicProvider('fr'));
    const a = registry.session('user-1:conn-1');
    a.markUsed('Merci pour votre retour.');
    expect(a.hasUsed('Merci pour votre retour.')).toBe(true);

    const b = registry.session('user-2:conn-9');
    expect(b).not.toBe(a);
    expect(b.hasUsed('Merci pour votre retour.')).toBe(false);
    // La session A éliminée ne peut plus produire.
    const late = await a.request(ctx('Merci pour votre m'));
    expect(late.stale).toBe(true);

    // Même ownerKey → même session (état conservé).
    expect(registry.session('user-2:conn-9')).toBe(b);
  });
});

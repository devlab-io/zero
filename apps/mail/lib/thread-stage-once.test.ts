import { markThreadStageOnce } from './thread-stage-once';
import { describe, expect, it, vi } from 'vitest';

// r15a : les jalons lecteur (data-ready, content-painted) sont posés UNE fois
// par fil ouvert. Preuve CUA du bug corrigé : trois mesures body-ready
// (7430/9846/10460 ms) pour une seule lecture — chaque transition de données
// re-marquait.

describe('markThreadStageOnce — dédupe par fil ouvert', () => {
  it('marque une seule fois par fil malgré des transitions de données répétées', () => {
    const ref = { current: null as string | null };
    const mark = vi.fn();

    expect(markThreadStageOnce(ref, 'thread-a', mark)).toBe(true);
    // Refetch, re-render, résolution CID… : mêmes données, même fil — silence.
    expect(markThreadStageOnce(ref, 'thread-a', mark)).toBe(false);
    expect(markThreadStageOnce(ref, 'thread-a', mark)).toBe(false);

    expect(mark).toHaveBeenCalledTimes(1);
  });

  it('navigation séquentielle A→B→A : une mesure par OUVERTURE, pas par fil', () => {
    const ref = { current: null as string | null };
    const mark = vi.fn();

    markThreadStageOnce(ref, 'thread-a', mark);
    markThreadStageOnce(ref, 'thread-a', mark);
    // ArrowDown : nouveau fil — nouvelle mesure.
    expect(markThreadStageOnce(ref, 'thread-b', mark)).toBe(true);
    markThreadStageOnce(ref, 'thread-b', mark);
    // ArrowUp : retour sur A = nouvelle ouverture, re-mesurée honnêtement.
    expect(markThreadStageOnce(ref, 'thread-a', mark)).toBe(true);

    expect(mark).toHaveBeenCalledTimes(3);
  });

  it('ignore un fil absent (lecteur fermé) sans toucher la ref', () => {
    const ref = { current: 'thread-a' as string | null };
    const mark = vi.fn();

    expect(markThreadStageOnce(ref, null, mark)).toBe(false);
    expect(markThreadStageOnce(ref, undefined, mark)).toBe(false);
    expect(markThreadStageOnce(ref, '', mark)).toBe(false);

    expect(mark).not.toHaveBeenCalled();
    // La ref n'est pas réinitialisée : rouvrir A sans passer par un autre fil
    // ne doit pas produire de doublon pour la MÊME ouverture.
    expect(ref.current).toBe('thread-a');
  });
});

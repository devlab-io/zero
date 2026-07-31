import {
  buildSessionPrimeSnippet,
  clearSessionPrime,
  consumeSessionPrime,
  SESSION_PRIME_TTL_MS,
} from './session-prime';
import { afterEach, describe, expect, it } from 'vitest';

// r9 (cold boot) : l'amorce lance la RTT session au parse du HTML pour la
// recouvrir avec le chargement du bundle. Ces tests prouvent la couture :
// one-shot, TTL, fallback, et un snippet qui ne peut pas casser la balise.
afterEach(() => {
  clearSessionPrime();
});

describe('buildSessionPrimeSnippet', () => {
  it('vise exactement /api/auth/get-session avec les cookies et pose le jalon perf', () => {
    const snippet = buildSessionPrimeSnippet('https://api.example.com');
    expect(snippet).toContain('"https://api.example.com/api/auth/get-session"');
    expect(snippet).toContain("credentials:'include'");
    expect(snippet).toContain("performance.mark('zero:boot:session-prime')");
    // r13 : le resolve effectif (succès ou échec) pose son propre jalon.
    expect(snippet).toContain("performance.mark('zero:boot:session-prime-resolved')");
    // Un échec réseau résout à null : le vrai appelant refera sa requête.
    expect(snippet).toContain('return null');
  });

  it('normalise le slash final et ne peut jamais fermer la balise script', () => {
    expect(buildSessionPrimeSnippet('https://api.example.com/')).toContain(
      '"https://api.example.com/api/auth/get-session"',
    );
    const hostile = buildSessionPrimeSnippet('https://x</script><script>alert(1)</script>');
    expect(hostile).not.toContain('</script>');
  });
});

describe('consumeSessionPrime — one-shot avec TTL', () => {
  it('amorce fraîche → sa promesse, UNE seule fois (jamais resservie après logout)', async () => {
    const primed = Promise.resolve(null);
    window.__zeroSessionPrime = { at: Date.now(), promise: primed };

    expect(consumeSessionPrime()).toBe(primed);
    // Consommée : le deuxième appel (ou un get-session post-logout) repart au réseau.
    expect(consumeSessionPrime()).toBeNull();
  });

  it('amorce périmée (> TTL : bfcache, onglet resté ouvert) → ignorée ET consommée', () => {
    window.__zeroSessionPrime = {
      at: Date.now() - SESSION_PRIME_TTL_MS - 1,
      promise: Promise.resolve(null),
    };
    expect(consumeSessionPrime()).toBeNull();
    expect(window.__zeroSessionPrime).toBeUndefined();
  });

  it('aucune amorce → null (chemin requête normale inchangé)', () => {
    expect(consumeSessionPrime()).toBeNull();
  });

  it('clearSessionPrime purge une amorce jamais consommée (hygiène logout)', () => {
    window.__zeroSessionPrime = { at: Date.now(), promise: Promise.resolve(null) };
    clearSessionPrime();
    expect(consumeSessionPrime()).toBeNull();
  });
});

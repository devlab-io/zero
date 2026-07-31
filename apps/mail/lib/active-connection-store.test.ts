import {
  __resetActiveConnectionStoreForTests,
  getActiveConnectionId,
  getConnectionEpoch,
  isStaleConnectionResponse,
  setActiveConnectionId,
  StaleConnectionResponseError,
  subscribeActiveConnection,
} from './active-connection-store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldRetryRead } from './query-retry';

afterEach(() => {
  __resetActiveConnectionStoreForTests();
});

describe('active-connection-store — epoch et fence de réponse tardive', () => {
  it("chaque changement effectif de compte avance l'epoch ; un no-op le laisse", () => {
    const e0 = getConnectionEpoch();
    setActiveConnectionId('admin');
    const e1 = getConnectionEpoch();
    expect(e1).toBe(e0 + 1);
    setActiveConnectionId('admin'); // no-op
    expect(getConnectionEpoch()).toBe(e1);
    setActiveConnectionId('thomas');
    expect(getConnectionEpoch()).toBe(e1 + 1);
    expect(getActiveConnectionId()).toBe('thomas');
  });

  it('fence : une réponse émise avant un switch est périmée à son atterrissage', () => {
    setActiveConnectionId('admin');
    const issuedEpoch = getConnectionEpoch(); // requête part sous admin
    setActiveConnectionId('thomas'); // switch pendant le vol
    expect(isStaleConnectionResponse(issuedEpoch, getConnectionEpoch())).toBe(true);
  });

  it('fence : sans switch pendant le vol, la réponse est acceptée', () => {
    setActiveConnectionId('admin');
    const issuedEpoch = getConnectionEpoch();
    expect(isStaleConnectionResponse(issuedEpoch, getConnectionEpoch())).toBe(false);
  });

  it('admin→Thomas→admin : les réponses des DEUX jambes du switch sont rejetées', () => {
    setActiveConnectionId('admin');
    const issuedUnderAdmin = getConnectionEpoch();
    setActiveConnectionId('thomas');
    const issuedUnderThomas = getConnectionEpoch();
    setActiveConnectionId('admin');
    // Revenir au même compte ne "réhabilite" pas une réponse qui a traversé
    // deux switchs : l'epoch est monotone, jamais réutilisé.
    expect(isStaleConnectionResponse(issuedUnderAdmin, getConnectionEpoch())).toBe(true);
    expect(isStaleConnectionResponse(issuedUnderThomas, getConnectionEpoch())).toBe(true);
  });

  it('les abonnés sont notifiés du changement de compte', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveConnection(listener);
    setActiveConnectionId('admin');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setActiveConnectionId('thomas');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('une StaleConnectionResponseError ne se retente jamais', () => {
    expect(shouldRetryRead(0, new StaleConnectionResponseError())).toBe(false);
  });
});

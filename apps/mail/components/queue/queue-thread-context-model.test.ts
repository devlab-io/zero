import { buildQueueThreadContext } from './queue-thread-context-model';
import type { ParsedMessage } from '@zero/types';
import { describe, expect, it } from 'vitest';

const message = (overrides: Partial<ParsedMessage> & { id: string }): ParsedMessage =>
  ({
    connectionId: 'conn-1',
    title: '',
    subject: 'Re: Mon cv',
    tags: [],
    sender: { name: 'Alan', email: 'alan@example.com' },
    to: [{ email: 'thomas@devlab.io' }],
    cc: null,
    bcc: null,
    tls: true,
    receivedOn: '2026-08-10T04:46:00.000Z',
    unread: false,
    body: '<p>Bonjour</p>',
    processedHtml: '<p>Bonjour</p>',
    blobUrl: '',
    ...overrides,
  }) as ParsedMessage;

describe('buildQueueThreadContext', () => {
  it('met en avant le dernier message non-brouillon et garde le reste en historique', () => {
    const context = buildQueueThreadContext(
      [
        message({ id: 'a' }),
        message({ id: 'b' }),
        message({ id: 'draft', isDraft: true }),
        message({ id: 'c' }),
      ],
      'thomas@devlab.io',
    );

    expect(context.latest?.id).toBe('c');
    expect(context.earlier.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('exclut les brouillons même en dernière position', () => {
    const context = buildQueueThreadContext(
      [message({ id: 'a' }), message({ id: 'draft', isDraft: true })],
      'thomas@devlab.io',
    );

    expect(context.latest?.id).toBe('a');
    expect(context.earlier).toEqual([]);
  });

  it('retourne un contexte vide sans messages', () => {
    expect(buildQueueThreadContext(undefined, 'thomas@devlab.io')).toEqual({
      latest: null,
      earlier: [],
      latestIsInbound: false,
    });
    expect(buildQueueThreadContext([], 'thomas@devlab.io').latest).toBeNull();
  });

  it('détecte entrant/sortant sans sensibilité à la casse', () => {
    const inbound = buildQueueThreadContext(
      [message({ id: 'a', sender: { email: 'Alan@Example.com' } })],
      'thomas@devlab.io',
    );
    const outbound = buildQueueThreadContext(
      [message({ id: 'a', sender: { email: 'Thomas@Devlab.io' } })],
      ' thomas@devlab.io ',
    );

    expect(inbound.latestIsInbound).toBe(true);
    expect(outbound.latestIsInbound).toBe(false);
  });

  it('suppose entrant quand l’email de la boîte est inconnu', () => {
    const context = buildQueueThreadContext([message({ id: 'a' })], null);
    expect(context.latestIsInbound).toBe(true);
  });
});

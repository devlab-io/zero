import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  complete: vi.fn(),
  createSelected: vi.fn(),
}));

const proc = vi.hoisted(() => {
  const build = (state: Record<string, unknown> = {}): any => ({
    input: (inputSchema: unknown) => build({ ...state, inputSchema }),
    mutation: (resolver: Function) => ({ ...state, resolver }),
  });
  return build();
});

vi.mock('../../trpc', () => ({ activeConnectionProcedure: proc }));
vi.mock('../../../lib/ask-reta/deps', () => ({
  createSelectedRetaModel: harness.createSelected,
}));

import { rewriteEmail } from './rewrite';

beforeEach(() => {
  harness.complete.mockReset();
  harness.createSelected.mockReset();
  harness.createSelected.mockResolvedValue({
    model: { key: 'anthropic:claude-fable-5', abortMode: 'native', complete: harness.complete },
    modelKey: 'anthropic:claude-fable-5',
  });
});

describe('rewriteEmail selected-model wiring', () => {
  it('uses the current user model/BYOK boundary and reports the exact model', async () => {
    harness.complete.mockResolvedValue('<p>Bonjour Thomas</p>');
    const procedure = rewriteEmail as unknown as {
      inputSchema: { parse: (value: unknown) => unknown };
      resolver: (args: unknown) => Promise<unknown>;
    };
    const input = procedure.inputSchema.parse({
      content: '<p>Bonjor Thomas</p>',
      mode: 'correct',
    });
    const signal = new AbortController().signal;
    const result = await procedure.resolver({
      input,
      ctx: { sessionUser: { id: 'user-1' }, c: { req: { raw: { signal } } } },
    });

    expect(harness.createSelected).toHaveBeenCalledWith('user-1');
    expect(harness.complete).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 2_500, temperature: 0.1, signal }),
    );
    expect(result).toEqual({
      html: '<p>Bonjour Thomas</p>',
      model: 'anthropic:claude-fable-5',
    });
  });
});

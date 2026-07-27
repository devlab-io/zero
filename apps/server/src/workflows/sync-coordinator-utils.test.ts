import {
  awaitPageCompletion,
  childWorkflowId,
  classifyPageStatus,
  createOrAttachPageWorkflow,
  pollDelayMs,
  type PageWorkflowHandle,
  type PollOptions,
} from './sync-coordinator-utils';
import { describe, expect, it, vi } from 'vitest';

const OPTS: PollOptions = { baseMs: 10, maxMs: 40, factor: 2, budgetMs: 1000 };

/** Horloge virtuelle : `sleep` avance le temps, aucun timer réel. */
function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      t += ms;
    }),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function handle(statuses: Array<{ status: string; output?: unknown } | Error>): PageWorkflowHandle {
  let i = 0;
  return {
    id: 'child-1',
    status: vi.fn(async () => {
      const next = statuses[Math.min(i++, statuses.length - 1)];
      if (next instanceof Error) throw next;
      return next;
    }),
  };
}

// ---------------------------------------------------------------------------
// P8 (a) — l'échec de page était masqué par le catch, puis maquillé en « timed out ».
// ---------------------------------------------------------------------------

describe('awaitPageCompletion — un échec de page n’est plus masqué (P8a)', () => {
  it('sort IMMÉDIATEMENT sur `errored`, sans épuiser le budget de cinq minutes', async () => {
    const clock = fakeClock();
    const instance = handle([{ status: 'running' }, { status: 'errored' }]);

    await expect(awaitPageCompletion(instance, clock, OPTS)).rejects.toThrow(/failed \(errored\)/);
    // Deux sondages seulement : la boucle n'a pas continué à tourner jusqu'à la deadline.
    expect(clock.sleep).toHaveBeenCalledTimes(2);
    expect(clock.now()).toBeLessThan(OPTS.budgetMs);
  });

  it('ne remonte plus « timed out » là où la page a échoué', async () => {
    const clock = fakeClock();
    await expect(awaitPageCompletion(handle([{ status: 'errored' }]), clock, OPTS)).rejects.toThrow(
      /failed/,
    );
    await expect(
      awaitPageCompletion(handle([{ status: 'errored' }]), clock, OPTS),
    ).rejects.not.toThrow(/timed out/);
  });

  it('traite `terminated` comme terminal, pas comme transitoire', async () => {
    const clock = fakeClock();
    await expect(
      awaitPageCompletion(handle([{ status: 'terminated' }]), clock, OPTS),
    ).rejects.toThrow(/failed \(terminated\)/);
  });

  it('rend la sortie de la page quand elle se termine', async () => {
    const clock = fakeClock();
    const out = await awaitPageCompletion(
      handle([
        { status: 'queued' },
        { status: 'running' },
        { status: 'complete', output: { synced: 7 } },
      ]),
      clock,
      OPTS,
    );
    expect(out).toEqual({ synced: 7 });
  });

  it('tolère une lecture d’état en échec tant qu’il reste du budget', async () => {
    const clock = fakeClock();
    const out = await awaitPageCompletion(
      handle([new Error('status rpc flake'), { status: 'complete', output: 'ok' }]),
      clock,
      OPTS,
    );
    expect(out).toBe('ok');
  });

  it('lève réellement « timed out » quand le budget est épuisé sans issue', async () => {
    const clock = fakeClock();
    await expect(
      awaitPageCompletion(handle([{ status: 'running' }]), clock, { ...OPTS, budgetMs: 100 }),
    ).rejects.toThrow(/timed out/);
  });
});

describe('classifyPageStatus', () => {
  it('sépare le terminal du transitoire', () => {
    expect(classifyPageStatus('complete')).toBe('complete');
    expect(classifyPageStatus('errored')).toBe('terminal-failure');
    expect(classifyPageStatus('terminated')).toBe('terminal-failure');
    expect(classifyPageStatus('unknown')).toBe('terminal-failure');
    expect(classifyPageStatus('running')).toBe('pending');
    expect(classifyPageStatus('queued')).toBe('pending');
    expect(classifyPageStatus('paused')).toBe('pending');
  });
});

describe('pollDelayMs', () => {
  it('croît puis plafonne', () => {
    expect(pollDelayMs(0, OPTS)).toBe(10);
    expect(pollDelayMs(1, OPTS)).toBe(20);
    expect(pollDelayMs(9, OPTS)).toBe(OPTS.maxMs);
  });
});

// ---------------------------------------------------------------------------
// P8 (b) — chaque tentative du step créait une NOUVELLE instance enfant.
// ---------------------------------------------------------------------------

describe('childWorkflowId — identifiant déterministe (P8b)', () => {
  it('deux tentatives du même step produisent le même identifiant', () => {
    expect(childWorkflowId('coord-abc', 'inbox', 3)).toBe(childWorkflowId('coord-abc', 'inbox', 3));
  });

  it('distingue les pages, les dossiers et les exécutions du coordinateur', () => {
    const a = childWorkflowId('coord-abc', 'inbox', 3);
    expect(a).not.toBe(childWorkflowId('coord-abc', 'inbox', 4));
    expect(a).not.toBe(childWorkflowId('coord-abc', 'sent', 3));
    expect(a).not.toBe(childWorkflowId('coord-xyz', 'inbox', 3));
  });

  it('reste dans l’alphabet et la longueur acceptés par Workflows', () => {
    const id = childWorkflowId(
      '0198a4f2-1c3d-7e8a-9f01-abcdef012345-and-then-some-extra-padding',
      'INBOX/Weird folder name!',
      12,
    );
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(id.length).toBeLessThanOrEqual(64);
  });
});

describe('createOrAttachPageWorkflow — le rejeu ne duplique plus la page (P8b)', () => {
  it('crée l’instance à la première tentative', async () => {
    const created: PageWorkflowHandle = {
      id: 'child-1',
      status: async () => ({ status: 'queued' }),
    };
    const binding = {
      create: vi.fn(async () => created),
      get: vi.fn(async () => created),
    };
    const out = await createOrAttachPageWorkflow(binding, 'child-1', { page: 1 });
    expect(out).toBe(created);
    expect(binding.create).toHaveBeenCalledWith({ id: 'child-1', params: { page: 1 } });
    expect(binding.get).not.toHaveBeenCalled();
  });

  it('se RATTACHE quand l’identifiant existe déjà, au lieu d’ouvrir une seconde instance', async () => {
    const existing: PageWorkflowHandle = {
      id: 'child-1',
      status: async () => ({ status: 'running' }),
    };
    const binding = {
      create: vi.fn(async () => {
        throw new Error('instance with id child-1 already exists');
      }),
      get: vi.fn(async () => existing),
    };

    const out = await createOrAttachPageWorkflow(binding, 'child-1', { page: 1 });

    expect(out).toBe(existing);
    expect(binding.get).toHaveBeenCalledWith('child-1');
    // La preuve du défaut corrigé : une seule instance enfant existe après le rejeu.
    expect(binding.create).toHaveBeenCalledTimes(1);
  });

  it('deux tentatives successives du même step ne créent qu’une instance', async () => {
    const instances = new Map<string, PageWorkflowHandle>();
    const binding = {
      create: vi.fn(async ({ id }: { id: string; params: unknown }) => {
        if (instances.has(id)) throw new Error('already exists');
        const h: PageWorkflowHandle = { id, status: async () => ({ status: 'running' }) };
        instances.set(id, h);
        return h;
      }),
      get: vi.fn(async (id: string) => instances.get(id) as PageWorkflowHandle),
    };

    const id = childWorkflowId('coord-abc', 'inbox', 1);
    const first = await createOrAttachPageWorkflow(binding, id, { page: 1 });
    const second = await createOrAttachPageWorkflow(binding, id, { page: 1 });

    expect(instances.size).toBe(1);
    expect(second).toBe(first);
  });
});

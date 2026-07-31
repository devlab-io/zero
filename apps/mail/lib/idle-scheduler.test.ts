import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleAfterPaintIdle } from './idle-scheduler';

// r11 : le travail lourd (hydratation des corps) doit démarrer APRÈS un frame
// peint puis à l'idle — jamais dans la fenêtre onSuccess→setIsRestoring(false)
// de TanStack. Ces tests pilotent rAF/rIC stubbés pour prouver l'ordre et
// l'annulation.

type Cb = () => void;
let rafQueue: Cb[];
let idleQueue: Cb[];

function stubSchedulers({ withIdle = true } = {}) {
  rafQueue = [];
  idleQueue = [];
  vi.stubGlobal('requestAnimationFrame', (cb: Cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  if (withIdle) {
    vi.stubGlobal('requestIdleCallback', (cb: Cb) => {
      idleQueue.push(cb);
      return idleQueue.length;
    });
    vi.stubGlobal('cancelIdleCallback', () => {});
  } else {
    vi.stubGlobal('requestIdleCallback', undefined);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('scheduleAfterPaintIdle', () => {
  it('n’exécute qu’après DEUX rAF (frame peint) PUIS le callback idle', () => {
    stubSchedulers();
    const run = vi.fn();
    scheduleAfterPaintIdle(run);

    expect(run).not.toHaveBeenCalled();
    rafQueue.shift()!(); // 1er rAF : avant présentation du frame
    expect(run).not.toHaveBeenCalled();
    rafQueue.shift()!(); // 2e rAF : un frame a été peint → planifie l'idle
    expect(run).not.toHaveBeenCalled();
    idleQueue.shift()!(); // idle : exécution
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('annulation AVANT l’idle : le travail ne s’exécute jamais (switch de compte)', () => {
    stubSchedulers();
    const run = vi.fn();
    const cancel = scheduleAfterPaintIdle(run);
    rafQueue.shift()!();
    rafQueue.shift()!();
    cancel();
    idleQueue.shift()!();
    expect(run).not.toHaveBeenCalled();
  });

  it('sans requestIdleCallback : repli setTimeout, toujours après les deux rAF', () => {
    vi.useFakeTimers();
    stubSchedulers({ withIdle: false });
    const run = vi.fn();
    scheduleAfterPaintIdle(run);
    rafQueue.shift()!();
    rafQueue.shift()!();
    expect(run).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

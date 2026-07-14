# Check — network and state robustness

PASS only if automated or browser fault injection proves:

- Uncached list 500/offline => explicit error + retry, never an empty state.
- Cached list refresh failure => cached rows remain + stale/offline notice.
- Active-thread 500/offline => finite error state + retry/back, never an endless skeleton.
- Read queries retry at most twice with capped exponential jitter; non-idempotent mutations do not.
- Draft survives component unmount, pagehide/reload, and a failed autosave request.
- Optimistic archive/star/read/snooze failure surfaces a recovery action and reconciles cache state.
- Outbox create/retry is idempotent under a duplicated request.
- A 30-minute local soak has no uncaught promise rejection, duplicate shortcut execution, leaked
  timer/listener warning, or monotonically growing request loop.


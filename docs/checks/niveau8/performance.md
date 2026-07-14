# Check — performance and faster-than-Shortwave claim

PASS only if:

- `docs/research/niveau8/benchmark-raw.*` contains at least 10 alternating measured iterations per
  comparative scenario after warmups, with environment metadata and no discarded run.
- The median and p75 table demonstrates every absolute budget in the spec.
- Warm inbox and cached thread-open p75 are each at least 10% below Shortwave on the same machine.
- A network log proves the first 50 inbox rows do not trigger per-row body or sanitization calls.
- Production build artifacts prove <= 420 KiB gzip critical inbox JS and no >900 KiB JS chunk.
- A Lighthouse or equivalent trace proves INP <=200 ms and CLS <=0.05 for the tested workflow.
- The report labels blocked authenticated measurements BLOCKED; it never substitutes estimates.


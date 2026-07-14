# Cold network trace — build final (LEAD A+C), 2026-07-14T05:03:08Z
## Served responses (wrangler dev, real HTTP, Accept: text/html)
GET / (landing)          -> HTTP 200
GET /mail/inbox (nav)    -> HTTP 200  (neutral shell)
GET /assets/react-DkPlOR9f.js -> HTTP 200

## Cold /mail/inbox boot-shell modulepreload set (__spa-fallback.html): 44 chunks
Heavy-dep chunks in BOOT shell preload: types(zod)=0 email-utils(email-addr)=0 purify(dompurify)=0

## Full cold inbox closure (measure-critical.py, = browser download on cold /mail/inbox)
TOTAL = 426.6 KiB gz. Binary chunk-presence trace of the closure:
 - color:          EVICTED (LEAD A)
 - email-addresses:EVICTED (LEAD A)
 - @react-email:   EVICTED (LEAD A)
 - dompurify:      PRESENT (bimi-avatar, security — not evictable)
 - zod (types chunk): EVICTED (LEAD F — config/shortcuts.ts dead schema → interface). Final closure = 414.6 KiB gz, GATE PASS +5.4.
   (types-*.js still emitted for compose/settings lazy routes, but NO LONGER in the cold /mail/inbox closure.)

Note: LEAD A is pure code-motion (no lazy/preload change) → manifest closure == network load;
no metric-gaming possible by construction (f143abf9 respected).

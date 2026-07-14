# Niveau 8 mail OS — frozen product and acceptance spec

Status: APPROVED in-session · Tracking: devlab-io/zero#11 · Date: 2026-07-12

## Outcome

Turn the Devlab Zero fork into a keyboard-first mail client that is measurably faster than
Shortwave on Thomas's Tahiti workstation, robust under weak or interrupted networks, and safe to
drive from Codex or Claude through a documented draft-only MCP/API surface.

"Faster than Shortwave" is a comparative measurement, not a visual claim. Both products must be
measured on the same machine, browser, network profile, mailbox-sized scenario, and run order
rotation. The result is accepted only from the saved evidence under `docs/research/niveau8/`.

## Non-negotiable product rules

1. No agent tool sends mail, permanently deletes mail, reports spam, or changes account settings.
2. Agent-created content is a Gmail draft or a reviewable outbox item. Human review remains the
   send boundary.
3. No screen may turn a read failure into an empty-mailbox claim or an infinite skeleton.
4. Every advertised shortcut has a live handler and an automated coverage assertion.
5. Single-key shortcuts never fire while the user is typing in an input, editor, or dialog.
6. Hot paths provide visible feedback within one animation frame and do not wait for a network
   round trip before updating the interface.
7. A production deploy, production data mutation, OAuth-console change, or real send is always a
   separate human approval.

## Shortwave keyboard contract

Source of truth: the official Shortwave shortcuts reference retrieved 2026-07-12:
<https://www.shortwave.com/docs/references/shortcuts/>.

Required parity covers every Shortwave action that has an equivalent Zero product capability.
`mod` means Command on macOS and Control elsewhere.

| Area | Required keys | Zero behavior |
|---|---|---|
| Compose | `c` | New draft |
| Compose | `r`, `a`, `f` | Reply, reply all, forward focused/open thread |
| Compose | `mod+Enter` | Send after normal in-product human action |
| Compose | `mod+shift+Enter` | Send and archive/done |
| Global | `/` | Open fast lexical search with focus in its input |
| Global | `Escape` | Close the topmost transient surface |
| Global | `shift+?`, `mod+/` | Open contextual shortcut reference |
| Thread | `d`, `e` | Done/archive and focus the next item |
| Thread | `[`, `]` | Done and open next/previous item |
| Thread | `b`, `h` | Open snooze/remind interaction |
| Thread | `s` | Toggle star |
| Thread | `l` | Open label picker |
| Thread | `v` | Open move picker |
| Thread | `#`, `Delete`, `mod+Backspace` | Move to bin, never permanent-delete |
| Thread | `u`, `shift+u` | Mark unread |
| Thread | `shift+i` | Mark read |
| Thread | `+`, `-` | Mark important / not important |
| Thread | `mod+z` | Undo latest reversible mail action |
| List | `j`, `ArrowDown`; `k`, `ArrowUp` | Focus next / previous without layout shift |
| List | `x` | Toggle selection of focused item |
| List | `Enter`, `ArrowRight` | Open focused thread |
| List | `Escape`, `ArrowLeft` | Close thread / clear selection |
| List | `Space`, `shift+Space` | Page down / up when focus is not in an editor |
| Layout | `mod+\\` | Toggle sidebar |
| Navigate | `g i`, `g s`, `g b`/`g h`, `g e`, `g t`, `g d`, `g !`, `g #` | Inbox, starred, snoozed, done, sent, drafts, spam, bin |
| Global | `mod+k`, `mod+shift+k`, `mod+shift+p` | Command palette |
| Global | `mod+,` | Settings |
| Global | `mod+shift+l` | Toggle theme |

Out of parity scope because Zero has no equivalent product capability: Shortwave team sharing,
assignment, team channels, todos, AI saved prompts/snippets, favorite-search number slots, and
account-number switching. They must not appear as working Zero shortcuts. Rich-text editor-native
formatting remains supported by TipTap and is checked separately from application hotkeys.

## Performance contract

Measurements use at least 10 iterations after 2 warmups, alternating Zero and Shortwave order.
Report median and p75; retain raw JSON/CSV. A network profile matching the observed Tahiti range
(175 ms RTT, 1.5 Mbps down, 750 Kbps up) is the constrained profile.

| Scenario | Required gate |
|---|---|
| Keyboard action feedback | p75 <= 100 ms from keydown to visible state |
| Composer open | p75 <= 150 ms warm; <= 300 ms constrained cold |
| Cached thread open | p75 <= 200 ms and at least 10% faster than Shortwave |
| Warm inbox usable | p75 <= 800 ms and at least 10% faster than Shortwave |
| Constrained cold inbox shell | visible non-blank shell <= 1,500 ms |
| Initial inbox data path | one list request plus at most one active-thread body request; no row N+1 |
| Initial list payload | <= 120 KiB compressed for 50 rows; no message bodies/base64 attachments |
| Critical inbox JS | <= 420 KiB gzip before usable inbox; no eager markdown/highlight/telemetry stack |
| Interaction stability | INP p75 <= 200 ms; CLS <= 0.05 |

If live Shortwave cannot be measured because its authenticated session is unavailable, absolute
budgets still gate the build but comparative acceptance stays BLOCKED rather than being guessed.

## Robustness contract

- Idempotent read retry: maximum 2 retries with capped exponential delay and jitter; mutations do
  not retry automatically unless the endpoint has an idempotency key.
- Inbox, search, thread, and outbox each distinguish loading, empty, stale/offline, and error.
- A cached list remains usable while refresh fails and clearly says it may be stale.
- An uncached list failure offers retry and never says the mailbox is empty.
- An active-thread failure ends the skeleton and offers retry/back navigation.
- Draft text is persisted before unmount/pagehide and restored after reload.
- Optimistic actions reconcile success/failure; failed actions are visible and retryable.
- Sync code uses bounded concurrency, exponential backoff with jitter, and observable progress.

## Security contract

- Better Auth and its MCP/OIDC surface are outside known fixed-version ranges for applicable
  critical/high advisories; targeted auth flows compile and pass tests.
- Gmail OAuth omits the full-mailbox `mail.google.com` scope and requests only the minimum union
  needed for the interactive mail client. Required scopes are documented.
- External MCP and in-app agent tool registries expose no send, permanent delete, spam, OAuth, or
  account-setting operation. Draft/outbox actions validate ownership and sanitize hidden content.
- Cookies remain secure, HTTP-only, same-site appropriate, and session/token caches have bounded
  lifetime and revocation behavior.
- No secrets enter git. CI runs targeted build, tests, security surface assertions, and a
  production dependency audit report. Residual advisories require an explicit reachability note.
- Cloudflare code follows current Workers guidance: no request state in module globals, no floating
  promises, explicit error responses, secrets only through bindings, and current generated types.

## Claude and Codex API contract

The MCP endpoint must support authenticated discovery plus: health/capabilities, account/list
connections, list/search threads with compact metadata, get a specific thread on demand, list
labels, create a Gmail draft, enqueue a reviewable draft job, inspect/cancel/retry outbox items.
Mutation tools must be idempotent. The published tool descriptions must say exactly what is stored
and that sending is impossible. Setup instructions and smoke commands are required for both Claude
Code/Desktop-compatible clients and Codex.

## Delivery waves

1. Baseline and frozen checks.
2. Security/auth/dependency/CI hardening.
3. Keyboard registry, exact sequences, contextual help, reply/composer correctness.
4. Rich thread-list projection and removal of the body/sanitization N+1.
5. Honest network states, retry policy, draft durability, optimistic reconciliation.
6. Critical-path/client-media reductions and server/sync hot-path work.
7. MCP/API completion, documentation, security tests.
8. Local browser QA, comparative benchmark, soak, final audit, commits and PR.

## Approval record

Thomas approved the run in the active Codex goal with the instruction beginning: "Lets gooooooo je
veux que ça soit les mêmes raccourcis que Shortwave ..." and explicitly asked Codex to continue
until the targets for speed, performance, robustness, UX, and security are reached. This approval
authorizes repository work and tracker updates only; it does not authorize the hard-stop actions
listed above.


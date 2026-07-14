# Architect judge: mcp-draft-loop — Draft Loop 4

Checks integrity: PASS
Raw evidence:
```text
freeze_sha=cdf864435fda113e1563bb409d659df6d761ed16
current_head=d5c87b9237197d0ebcb6d17d9c9c3588ce33826c
checkrun_integrity=check_file_matches_freeze=true
git diff cdf864435fda113e1563bb409d659df6d761ed16..HEAD -- docs/checks/
<no output>
exit: 0

git diff --name-only 623dd474ddea83bef67a19acbfec5a9f38b46eba..HEAD
docs/jobs/niveau10/mcp-draft-loop-checkrun.md
exit: 0
```
The frozen contract is unchanged. The only change after the code HEAD used by the supplied checkrun is the refreshed checkrun document itself, so the recorded runs cover the current implementation.

Diff vs intent: PASS
The implementation remains within the frozen MCP draft-loop slice: bounded thread context, reply-draft creation, draft read/update semantics, provider-CAS fail-closed behavior, account/ownership and idempotency isolation, client setup documentation, schema/smoke evidence, and the draft-only security guard. The touch-set check passed and no frozen check file was modified.

## Frozen RUN evidence

### RUN line 9 — focused MCP draft-loop tests: PASS

Command:
```sh
pnpm --filter @zero/server exec vitest run src/routes/agent/mcp-draft-loop.test.ts src/routes/agent/mcp-tools.test.ts
```

Source: independently re-run by this judge at current HEAD.

Raw stdout/stderr and exit:
```text
 RUN  v3.2.7 /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server

 ✓ src/routes/agent/mcp-tools.test.ts (23 tests) 10ms
 ✓ src/routes/agent/mcp-draft-loop.test.ts (17 tests) 61ms

 Test Files  2 passed (2)
      Tests  40 passed (40)
   Start at  04:24:39
   Duration  853ms (transform 175ms, setup 0ms, collect 688ms, tests 70ms, environment 0ms, prepare 102ms)

exit: 0
```
This matches the evidence-file result semantically: the same two files and all 40 tests pass; only timing metadata differs.

### RUN line 10 — security surface: PASS

Command:
```sh
node scripts/security/check-agent-surface.mjs
```

Source: independently re-run by this judge at current HEAD.

Raw stdout/stderr and exit:
```text
Security surface check passed: least scopes, bounded session cache, draft-only MCP.
exit: 0
```

### RUN line 11 — ESLint and Prettier: PASS

Command:
```sh
pnpm --filter @zero/server exec eslint src/routes/agent/mcp.ts src/routes/agent/mcp-tools.ts src/routes/agent/mcp-tools.test.ts src/routes/agent/mcp-draft-loop.ts src/routes/agent/mcp-draft-loop.test.ts src/lib/driver/agent-drafts.ts src/lib/driver/google-drafts.ts && pnpm exec prettier apps/server/src/lib/driver/microsoft.ts docs/agent --check
```

Source: `docs/jobs/niveau10/mcp-draft-loop-checkrun.md`.

Raw stdout/stderr and exit:
```text
Warning: React version not specified in eslint-plugin-react settings. See https://github.com/jsx-eslint/eslint-plugin-react#configuration .
Checking formatting...
All matched files use Prettier code style!
exit: 0
```

### RUN line 12 — generated Workers types and TypeScript: PASS

Command:
```sh
pnpm --filter @zero/server types && pnpm --filter @zero/server exec tsc --noEmit
```

Source: `docs/jobs/niveau10/mcp-draft-loop-checkrun.md`.

Raw stdout/stderr and exit:
```text
> @zero/server@ types /Users/thomasverdenne/cc/zero-niveau10/.architect/wt/niveau10/mcp-draft-loop-01/apps/server
> wrangler types --env local

 ⛅️ wrangler 4.32.0 (update available 4.110.0)
──────────────────────────────────────────────
Generating project types...
Generating runtime types...
Runtime types generated.

✨ Types written to worker-configuration.d.ts

📖 Read about runtime types
https://developers.cloudflare.com/workers/languages/typescript/#generate-types
📣 Remember to rerun 'wrangler types' after you change your wrangler.json file.

exit: 0
```
The checkrun contains the complete generated declaration block between the two generation messages; it reports no TypeScript diagnostic.

### RUN line 13 — allowed touch set: PASS

Command:
```sh
git status --porcelain --untracked-files=all | sed 's/^...//' | awk '!/^(apps\/server\/src\/(routes\/agent\/mcp[^\/]*\.ts|lib\/driver\/.*)|docs\/agent\/.*|scripts\/security\/check-agent-surface\.mjs|docs\/jobs\/niveau10\/mcp-draft-loop-01\.md)$/ {print; bad=1} END {exit bad}'
```

Source: `docs/jobs/niveau10/mcp-draft-loop-checkrun.md`.

Raw stdout/stderr and exit:
```text
<no output>
exit: 0
```

### RUN line 14 — whitespace/error diff check: PASS

Command:
```sh
git diff --check
```

Source: evidence file and independently re-run by this judge.

Raw stdout/stderr and exit:
```text
<no output>
exit: 0
```

## Judge-only acceptance audit

1. **No-CAS rejection occurs before idempotency or provider draft effects: PASS.** `apps/server/src/routes/agent/mcp-draft-loop.ts:253-262` resolves the active provider update capability and throws the documented unsupported error before calling `idempotency.reserve` or reading/updating a provider draft. The focused regression at `apps/server/src/routes/agent/mcp-draft-loop.test.ts:486-535` asserts zero idempotency puts, zero provider draft reads, zero conditional attempts, zero updates, and an unchanged body.

2. **Fake provider CAS, opaque token, stale 412-equivalent, and no overwrite: PASS.** The fake provider maintains and rotates a per-draft CAS token and performs compare-and-update atomically at `apps/server/src/routes/agent/mcp-draft-loop.test.ts:107-223`. The concurrent-edit case at `apps/server/src/routes/agent/mcp-draft-loop.test.ts:455-484` returns the stale-draft 412-equivalent and preserves the injected concurrent body. Production orchestration passes the opaque provider token to the conditional seam and maps `precondition_failed` without an unconditional fallback at `apps/server/src/routes/agent/mcp-draft-loop.ts:262-303`.

3. **Capabilities, `getDraft`, snapshot, docs, and Google/Microsoft safe fallback are honest: PASS.** Capability normalization requires both the exact `provider-native-atomic-cas` mode and the conditional seams; otherwise support is forced false at `apps/server/src/routes/agent/mcp-draft-loop.ts:139-169`. The live route exposes Google/Microsoft as unsupported at `apps/server/src/routes/agent/mcp.ts:139-154` and `apps/server/src/routes/agent/mcp.ts:558-598`. `getDraft` returns the active capability at `apps/server/src/routes/agent/mcp-draft-loop.ts:244-250`. The fallback is explicitly “create a new unsent draft” in `apps/server/src/lib/driver/draft-update-capability.ts:17-47`; the same policy is reflected in `docs/agent/mcp-schema.snapshot.json:1-25`, `docs/agent/codex-setup.md:43-60`, and `docs/agent/claude-setup.md:46-62`. There is no path from the MCP update tool to the legacy unconditional provider methods while capability is unsupported.

4. **Successful conditional update preserves draft ID and advances revision: PASS.** The success case at `apps/server/src/routes/agent/mcp-draft-loop.test.ts:417-453` asserts the same draft ID, a new opaque revision, and stale-revision rejection. The implementation refetches the draft, verifies semantic body equality, and rejects a non-advancing revision at `apps/server/src/routes/agent/mcp-draft-loop.ts:304-321`.

5. **Gmail threading correctness: PASS.** Reply metadata is derived from provider headers and validated against CR/LF injection at `apps/server/src/lib/driver/agent-drafts.ts:80-116` and `apps/server/src/lib/driver/agent-drafts.ts:331-373`. The focused MIME regression at `apps/server/src/routes/agent/mcp-draft-loop.test.ts:678-736` verifies provider thread ID plus server-derived `In-Reply-To` and `References` values and rejects injected values before side effects.

6. **Normalized-body success: PASS.** The updater sanitizes and compares the refetched provider body semantically at `apps/server/src/routes/agent/mcp-draft-loop.ts:304-321`. The regression at `apps/server/src/routes/agent/mcp-draft-loop.test.ts:537-568` accepts provider-normalized HTML while still requiring the same ID and a fresh revision.

7. **Ownership and multi-account idempotency isolation: PASS.** Active connection resolution and persistence are user-scoped at `apps/server/src/routes/agent/mcp-account.ts:30-66` and `apps/server/src/routes/agent/mcp.ts:116-133`. Missing and other-user draft IDs have the same sentinel result at `apps/server/src/routes/agent/mcp-draft-loop.test.ts:598-605`. Idempotency keys include connection ID at `apps/server/src/routes/agent/mcp-tools.ts:214-215`; `apps/server/src/routes/agent/mcp-idempotency.test.ts:69-84` covers reuse of the same client key independently on two connections.

8. **Draft-only surface and absence of dangerous tools: PASS.** Server instructions forbid send, delete, spam, account-setting, and provider-escape actions at `apps/server/src/routes/agent/mcp-tools.ts:54-55`. The catalogue/security script at `scripts/security/check-agent-surface.mjs:24-185` rejects dangerous registrations and only permits bounded draft/outbox writes. The exact security command re-run passed. The HTTP tool-list smoke at `apps/server/src/routes/agent/mcp-draft-loop.test.ts:739-891` also asserts the five expected draft-loop tools and absence of forbidden tools.

9. **All six frozen RUN commands exit zero: PASS.** RUN lines 9–14 all record exit 0 in the trusted checkrun. The judge independently re-ran RUN 9 and RUN 10, plus `git diff --check`; outputs agree with the recorded evidence apart from nondeterministic test timing.

Client-command spot check: PASS. Installed `codex-cli 0.144.1` and `Claude Code 2.1.209` help output accepts the documented HTTP MCP add/login forms. A temporary `codex mcp get` configuration with the documented `url`, `auth`, `enabled_tools`, and `default_tools_approval_mode` keys parsed successfully.

Slice verdict: PASS
Decisive reason: The current code implements a true provider-CAS seam for supported providers, fails closed before idempotency/provider draft effects for the currently unsupported Google/Microsoft paths, preserves ownership and account isolation, keeps the MCP surface draft-only, and passes all six immutable checks. The judge found no correctness defect against the frozen contract or post-freeze ruling.

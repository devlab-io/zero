# Zero MCP revisable-draft smoke

This proof is local, deterministic, and in-process. It does not use OAuth consent,
production credentials, network mail access, a deploy, or a real mailbox mutation.

`apps/server/src/routes/agent/mcp-draft-loop.test.ts` constructs the installed MCP SDK's
Web Standard Streamable HTTP transport and sends actual HTTP `Request` objects through this
sequence:

1. `initialize` with MCP protocol `2025-11-25`;
2. `notifications/initialized`;
3. `tools/list`;
4. `tools/call(getThreadContext)`;
5. `tools/call(createReplyDraft)`;
6. `tools/call(getDraft)`;
7. `tools/call(updateDraft)`.

The server and provider dependencies are realistic in-memory fakes. The smoke asserts:

- server instructions are present in initialization;
- the five draft-loop tools are listed with no send, approve, delete, spam, or settings
  tool;
- thread context contains at most 20 messages and 64 KiB of sanitized text, without raw
  attachments or headers;
- reply recipients, subject, and thread identity come from the owned thread/account;
- create and update retain the same provider draft ID;
- the revised body is refetched from provider state;
- the fake exposes no send dependency and observes zero send calls.

Focused tests around the same handlers separately prove 20 concurrent same-key create and
update calls produce one provider effect, changed-payload key reuse conflicts before a
second effect, stale revision changes nothing, and missing/other-user draft IDs return the
same result.

`mcp-smoke.evidence.json` is the compact assertion manifest for this test. The committed
tool/schema snapshot is drift-checked by `mcp-tools.test.ts` against the single TypeScript
catalogue.

No live or hosted smoke is claimed. A real Codex/Claude OAuth login, hosted connector, or
mailbox draft remains a separate human-authorized operation described in the setup guides.

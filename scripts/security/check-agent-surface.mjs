import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const [toolRegistry, mcp, mcpTools, scopes, auth, prompt, legacyPrompt] = await Promise.all([
  read('apps/server/src/routes/agent/tools.ts'),
  read('apps/server/src/routes/agent/mcp.ts'),
  read('apps/server/src/routes/agent/mcp-tools.ts'),
  read('apps/server/src/lib/google-scopes.ts'),
  read('apps/server/src/lib/auth.ts'),
  read('apps/server/src/lib/prompts.ts'),
  read('apps/server/src/services/call-service/system-prompt.ts'),
]);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const dangerousRegistration of [
  'Tools.SendEmail]:',
  'Tools.BulkDelete]:',
  'Tools.DeleteLabel]:',
]) {
  assert(
    !toolRegistry.includes(dangerousRegistration),
    `in-app agent still registers ${dangerousRegistration}`,
  );
}

for (const staleTool of ['sendEmail(', 'bulkDelete(']) {
  assert(!prompt.includes(staleTool), `primary prompt still advertises ${staleTool}`);
  assert(!legacyPrompt.includes(staleTool), `legacy prompt still advertises ${staleTool}`);
}

for (const requiredDraftTool of ["'createDraft'", "'enqueueDraftJob'"]) {
  assert(mcp.includes(requiredDraftTool), `MCP is missing ${requiredDraftTool}`);
}

for (const forbiddenMcpTool of ["'sendEmail'", "'bulkDelete'", "'deleteLabel'"]) {
  assert(!mcp.includes(forbiddenMcpTool), `MCP exposes forbidden tool ${forbiddenMcpTool}`);
}

// --- #36 extension: draft-only "Claude and Codex API" completion ------------
// New assertions only — the checks above are preserved verbatim and never weakened.

// (a) The completed read + reviewable-outbox surface must be registered in mcp.ts.
for (const requiredMcpTool of [
  "'getServerCapabilities'",
  "'searchThreads'",
  "'listOutbox'",
  "'getOutboxItem'",
  "'cancelOutboxItem'",
  "'retryOutboxItem'",
]) {
  assert(mcp.includes(requiredMcpTool), `MCP is missing required tool ${requiredMcpTool}`);
}

// (b) No send / permanent-delete / spam / account-settings surface, and the mutation
// tools retired from the MCP surface (#36 D1) must stay absent.
for (const forbiddenMcpTool of [
  "'sendDraft'",
  "'deleteThread'",
  "'deleteAllSpam'",
  "'markAsSpam'",
  "'reportSpam'",
  "'updateSettings'",
  "'markThreadsRead'",
  "'markThreadsUnread'",
  "'modifyLabels'",
  "'createLabel'",
  "'approveDraft'",
  "'approveOutboxItem'",
  "'getThreadContext'",
  "'createReplyDraft'",
  "'listDrafts'",
  "'getDraft'",
  "'updateDraft'",
]) {
  assert(
    !mcp.includes(forbiddenMcpTool) && !mcpTools.includes(`name: ${forbiddenMcpTool}`),
    `MCP exposes forbidden/retired/out-of-slice tool ${forbiddenMcpTool}`,
  );
}

for (const genericProviderEscapeHatch of [
  "'gmailRequest'",
  "'executeGmailRequest'",
  "'rawProviderRequest'",
]) {
  assert(
    !mcp.includes(genericProviderEscapeHatch) && !mcpTools.includes(genericProviderEscapeHatch),
    `MCP exposes generic provider escape hatch ${genericProviderEscapeHatch}`,
  );
}

// (c) Validate the live TypeScript catalogue, not an older docs snapshot outside this slice.
for (const guarantee of [
  'canSendMail',
  'canPermanentlyDeleteMail',
  'canReportSpam',
  'canChangeAccountSettings',
]) {
  assert(
    new RegExp(`${guarantee}:\\s*false`).test(mcpTools),
    `MCP catalogue must guarantee ${guarantee} === false`,
  );
}

const tools = [...mcpTools.matchAll(
  /\{\s*name:\s*'([^']+)',\s*category:\s*'(read|write)',\s*mutates:\s*(true|false),\s*idempotent:\s*(true|false),/g,
)].map((match) => ({
  name: match[1],
  category: match[2],
  mutates: match[3] === 'true',
  idempotent: match[4] === 'true',
}));
assert(tools.length === 18, `MCP live catalogue must contain exactly 18 tools, found ${tools.length}`);

const toolNames = new Set(tools.map((tool) => tool.name));
const writeWhitelist = new Set([
  'createDraft',
  'enqueueDraftJob',
  'cancelOutboxItem',
  'retryOutboxItem',
]);
for (const tool of tools) {
  if (tool.category === 'write') {
    assert(
      writeWhitelist.has(tool.name),
      `MCP live write tool "${tool.name}" is outside the draft/outbox whitelist`,
    );
  }
  if (tool.mutates) {
    assert(tool.idempotent, `MCP live mutation tool "${tool.name}" is not idempotent`);
  }
}

for (const requiredRead of [
  'getServerCapabilities',
  'getConnections',
  'listThreads',
  'searchThreads',
  'getThread',
  'getUserLabels',
  'getLabel',
]) {
  assert(toolNames.has(requiredRead), `MCP live catalogue is missing required read tool ${requiredRead}`);
}

assert(!scopes.includes('https://mail.google.com/'), 'unrestricted Gmail scope is present');
assert(scopes.includes('/auth/gmail.modify'), 'gmail.modify is missing');
assert(scopes.includes('/auth/gmail.compose'), 'gmail.compose is missing');
assert(
  auth.includes('maxAge: 60 * 5'),
  'session cookie cache revocation window is not five minutes',
);

if (failures.length) {
  console.error(`Security surface check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Security surface check passed: least scopes, bounded session cache, draft-only MCP.');

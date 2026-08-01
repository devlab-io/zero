import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const [toolRegistry, mcp, scopes, auth, prompt, legacyPrompt] = await Promise.all([
  read('apps/server/src/routes/agent/tools.ts'),
  read('apps/server/src/routes/agent/mcp.ts'),
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
]) {
  assert(!mcp.includes(forbiddenMcpTool), `MCP exposes forbidden/retired tool ${forbiddenMcpTool}`);
}

// (c) Committable MCP schema snapshot must exist and encode the draft-only guarantees.
let schemaSnapshot = null;
try {
  schemaSnapshot = JSON.parse(await read('docs/agent/mcp-schema.snapshot.json'));
} catch {
  schemaSnapshot = null;
}
assert(
  schemaSnapshot,
  'MCP schema snapshot docs/agent/mcp-schema.snapshot.json is missing/invalid',
);

if (schemaSnapshot) {
  // P9 élargi : plus AUCUN envoi sans confirmation humaine, et l'unique
  // exception (sendConfirmedDraft) porte un contrat d'elicitation NON
  // contournable, asserté tool par tool ci-dessous.
  for (const guarantee of [
    'canSendMailWithoutHumanConfirmation',
    'canPermanentlyDeleteMail',
    'canReportSpam',
    'canChangeAccountSettings',
  ]) {
    assert(
      schemaSnapshot[guarantee] === false,
      `MCP snapshot must guarantee ${guarantee} === false`,
    );
  }
  assert(schemaSnapshot.draftFirst === true, 'MCP snapshot must declare draftFirst === true');
  assert(
    schemaSnapshot.sendException?.tool === 'sendConfirmedDraft' &&
      schemaSnapshot.sendException?.humanConfirmation === 'elicitation' &&
      schemaSnapshot.sendException?.transport === 'durable-outbox',
    'MCP snapshot must declare sendConfirmedDraft as the ONLY send exception, gated by elicitation over the durable outbox',
  );
  assert(
    /EXCEPT sendConfirmedDraft/.test(schemaSnapshot.statement ?? '') &&
      /elicitation/i.test(schemaSnapshot.statement ?? ''),
    'MCP snapshot statement must state the single elicitation-gated send exception',
  );

  const tools = Array.isArray(schemaSnapshot.tools) ? schemaSnapshot.tools : [];
  const toolNames = new Set(tools.map((t) => t.name));

  // WRITE tools are limited to create/update draft + reviewable outbox
  // create/inspect/cancel/retry + the SINGLE elicitation-gated send exception.
  const writeWhitelist = new Set([
    'createDraft',
    'updateDraft',
    'sendConfirmedDraft',
    'enqueueDraftJob',
    'cancelOutboxItem',
    'retryOutboxItem',
  ]);
  const sendCapableTools = tools.filter((t) => t.sendCapable === true);
  assert(
    sendCapableTools.length === 1 && sendCapableTools[0].name === 'sendConfirmedDraft',
    'exactly ONE tool may be sendCapable, and it must be sendConfirmedDraft',
  );
  for (const tool of tools) {
    if (tool.category === 'write') {
      assert(
        writeWhitelist.has(tool.name),
        `MCP snapshot write tool "${tool.name}" is outside the draft/outbox whitelist`,
      );
    }
    if (tool.name === 'sendConfirmedDraft') {
      assert(
        tool.sendCapable === true && tool.humanConfirmation === 'elicitation',
        'sendConfirmedDraft must declare sendCapable + humanConfirmation=elicitation',
      );
      assert(
        /elicitation/i.test(tool.description) &&
          /fail closed/i.test(tool.description) &&
          /sendStoredDraft/.test(tool.description),
        'sendConfirmedDraft description must state the elicitation gate, fail-closed behaviour and stored-draft delivery',
      );
    } else {
      assert(
        tool.sendCapable !== true,
        `tool "${tool.name}" must NOT be sendCapable — sendConfirmedDraft is the only exception`,
      );
    }
    // Every mutation tool must be idempotent (spec §"Mutation tools must be idempotent").
    if (tool.mutates) {
      assert(
        tool.idempotent === true,
        `MCP snapshot mutation tool "${tool.name}" is not idempotent`,
      );
    }
  }

  // Required read coverage: capabilities, connections, compact list/search, thread, labels.
  for (const requiredRead of [
    'getServerCapabilities',
    'getConnections',
    'listThreads',
    'searchThreads',
    'getThread',
    'getUserLabels',
    'getLabel',
  ]) {
    assert(
      toolNames.has(requiredRead),
      `MCP snapshot is missing required read tool ${requiredRead}`,
    );
  }
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

console.log(
  'Security surface check passed: least scopes, bounded session cache, draft-first MCP with one elicitation-gated send.',
);

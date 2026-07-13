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

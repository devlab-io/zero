/**
 * Deterministic boundary for agent tool calls.
 *
 * The model may read hostile email, HTML, OCR, attachment text, web pages and MCP
 * results. None of those channels may grant authority. Only a recent `user` role
 * message can authorize a protected read or mutation.
 */

export type AgentPolicyMessage = {
  role?: string;
  content?: unknown;
  parts?: unknown;
};

export type AgentToolAuthorization = {
  allowed: boolean;
  reason: string;
  trustedUserText: string;
};

export type AgentToolAuthorizationInput = {
  toolName: string;
  args?: unknown;
  messages?: AgentPolicyMessage[];
};

export type BlockedAgentToolResult = {
  success: false;
  blocked: true;
  error: string;
};

export type NeutralizedUnicode = {
  text: string;
  removedInvisibleControls: number;
  removedBidirectionalControls: number;
};

const INVISIBLE_UNICODE =
  /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u2060\ufeff\ufe00-\ufe0f\u{e0000}-\u{e007f}]/gu;
const BIDIRECTIONAL_UNICODE = /[\u202a-\u202e\u2066-\u2069]/gu;

/** Neutralize invisible and bidirectional controls before content reaches a model. */
export function neutralizeUnicodeControls(value: string): NeutralizedUnicode {
  let removedInvisibleControls = 0;
  let removedBidirectionalControls = 0;

  const normalized = value.normalize('NFKC');
  const withoutBidi = normalized.replace(BIDIRECTIONAL_UNICODE, () => {
    removedBidirectionalControls += 1;
    return ' [bidirectional control removed] ';
  });
  const text = withoutBidi.replace(INVISIBLE_UNICODE, () => {
    removedInvisibleControls += 1;
    return ' ';
  });

  return { text, removedInvisibleControls, removedBidirectionalControls };
}

const HARD_BLOCKED_TOOL =
  /(?:^|_)(?:sendEmail|bulkDelete|deleteEmail|deleteLabel|deleteAllSpam|markAsSpam|reportSpam|permanentlyDelete)(?:$|_)/i;

const INTENT_PATTERNS = {
  search:
    /^(?:(?:please|kindly|can you|could you|would you|peux[- ]tu|pouvez[- ]vous|merci de)\s+)*(?:find|search|show|list|look for|which|what|cherche|recherche|trouve|affiche|liste|quel(?:le)?s?)\b/i,
  read: /^(?:(?:please|kindly|can you|could you|would you|peux[- ]tu|pouvez[- ]vous|merci de)\s+)*(?:read|open|summari[sz]e|explain|what|show|lis|lire|ouvre|résume|resume|explique|quel(?:le)?s?)\b/i,
  web: /^(?=.*\b(?:web|internet|online|en ligne)\b)(?:(?:please|can you|could you|peux[- ]tu|merci de)\s+)*(?:search|find|look up|cherche|recherche|trouve)\b/i,
  draft:
    /^(?:(?:please|kindly|can you|could you|would you|peux[- ]tu|pouvez[- ]vous|merci de)\s+)*(?:draft|compose|write|prepare|reply|respond|rédige|redige|prépare|prepare|réponds|reponds|écris|ecris)\b/i,
  archive:
    /^(?:(?:please|kindly|can you|could you|would you|peux[- ]tu|pouvez[- ]vous|merci de)\s+)*(?:archive|archiver|move\b.{0,40}\barchive)\b/i,
  labels:
    /^(?:(?:please|kindly|can you|could you|would you|peux[- ]tu|pouvez[- ]vous|merci de)\s+)*(?:label|tag|create (?:a )?label|apply (?:a )?label|étiquette|etiquette|crée (?:une )?étiquette|cree (?:une )?etiquette)\b/i,
  markRead:
    /^(?:(?:please|can you|could you|peux[- ]tu|merci de)\s+)*(?:mark\b.{0,30}\bread|marque\b.{0,30}\blu(?:s)?)\b/i,
  markUnread:
    /^(?:(?:please|can you|could you|peux[- ]tu|merci de)\s+)*(?:mark\b.{0,30}\bunread|marque\b.{0,30}\bnon lu(?:s)?)\b/i,
  cancel:
    /^(?:(?:please|can you|could you|peux[- ]tu|merci de)\s+)*(?:cancel|stop|annule|arrête|arrete)\b/i,
  retry:
    /^(?:(?:please|can you|could you|peux[- ]tu|merci de)\s+)*(?:retry|try again|réessaie|reessaie|relance)\b/i,
} as const;

type Intent = keyof typeof INTENT_PATTERNS;

const TOOL_INTENTS: Record<string, Intent> = {
  listThreads: 'search',
  searchThreads: 'search',
  inboxRag: 'search',
  buildGmailSearchQuery: 'search',
  getThread: 'read',
  getThreadSummary: 'read',
  webSearch: 'web',
  composeEmail: 'draft',
  createDraft: 'draft',
  enqueueDraftJob: 'draft',
  bulkArchive: 'archive',
  modifyLabels: 'labels',
  createLabel: 'labels',
  markThreadsRead: 'markRead',
  markThreadsUnread: 'markUnread',
  cancelOutboxItem: 'cancel',
  retryOutboxItem: 'retry',
};

const BULK_MUTATIONS = new Set([
  'bulkArchive',
  'modifyLabels',
  'markThreadsRead',
  'markThreadsUnread',
]);

const DRAFT_TOOLS = new Set(['composeEmail', 'createDraft', 'enqueueDraftJob']);
const MAILBOX_SEARCH_TOOLS = new Set([
  'listThreads',
  'searchThreads',
  'inboxRag',
  'buildGmailSearchQuery',
]);
const CONFIRMATION =
  /^\s*(?:yes|yes,? confirmed|confirm(?:ed)?|proceed|oui|je confirme|vas[- ]y|go)\s*[.!]?\s*$/i;

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!content) return '';
  if (Array.isArray(content)) return content.map(contentToText).filter(Boolean).join('\n');
  if (typeof content !== 'object') return '';

  const candidate = content as Record<string, unknown>;
  if (typeof candidate.text === 'string') return candidate.text;
  if ('content' in candidate) return contentToText(candidate.content);
  if ('parts' in candidate) return contentToText(candidate.parts);
  return '';
}

function trustedUserTurns(messages: AgentPolicyMessage[] | undefined): string[] {
  return (messages ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => contentToText(message.content ?? message.parts).trim())
    .filter(Boolean);
}

function getAuthorizationTurn(messages: AgentPolicyMessage[] | undefined) {
  const turns = trustedUserTurns(messages);
  const latest = turns.at(-1) ?? '';
  const confirmed = CONFIRMATION.test(latest);
  return {
    confirmed,
    latest,
    intentText: confirmed ? (turns.at(-2) ?? '') : latest,
    allTrustedText: turns.join('\n'),
  };
}

function getThreadIds(args: unknown): string[] {
  if (!args || typeof args !== 'object') return [];
  const value = (args as Record<string, unknown>).threadIds;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function getArgumentString(args: unknown, key: string): string {
  if (!args || typeof args !== 'object') return '';
  const value = (args as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function unmentionedEmail(value: string, trustedText: string): string | undefined {
  return (value.match(/[\w.+-]+@[\w.-]+/g) ?? []).find(
    (email) => !trustedText.toLowerCase().includes(email.toLowerCase()),
  );
}

function mailboxSearchScopeIsAuthorized(args: unknown, trustedText: string): string | null {
  const query = getArgumentString(args, 'query');
  const expandedScope = query.match(
    /\b(?:(?:other|all|every)\s+(?:clients?|customers?|tenants?|mailboxes?)|entire\s+mailbox)\b/i,
  )?.[0];
  if (expandedScope && !trustedText.toLowerCase().includes(expandedScope.toLowerCase())) {
    return `mailbox search expands scope beyond the user request: ${expandedScope}`;
  }

  const email = unmentionedEmail(query, trustedText);
  return email ? `mailbox search introduces an email not named by the user: ${email}` : null;
}

function webSearchScopeIsAuthorized(args: unknown, trustedText: string): string | null {
  const query = getArgumentString(args, 'query');
  const email = unmentionedEmail(query, trustedText);
  if (email) return `web search exposes an email not named by the user: ${email}`;

  const urls = query.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const unmentionedUrl = urls.find((url) => !trustedText.includes(url));
  return unmentionedUrl
    ? `web search contains an outbound URL not supplied by the user: ${unmentionedUrl}`
    : null;
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (!value || typeof value !== 'object') return [];

  return Object.values(value as Record<string, unknown>).flatMap(flattenStrings);
}

function draftScopeIsAuthorized(args: unknown, trustedText: string): string | null {
  const values = args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
  const recipients = ['to', 'cc', 'bcc'].flatMap((key) => flattenStrings(values[key]));
  const explicitRecipients = recipients.flatMap(
    (recipient) => recipient.match(/[\w.+-]+@[\w.-]+/g) ?? [],
  );
  const unmentionedRecipient = explicitRecipients.find(
    (recipient) => !trustedText.toLowerCase().includes(recipient.toLowerCase()),
  );
  if (unmentionedRecipient)
    return `draft recipient was not named by the user: ${unmentionedRecipient}`;

  const outboundValues = ['message', 'body', 'prompt', 'mission'].flatMap((key) => {
    const value = values[key];
    return typeof value === 'string' ? [value] : [];
  });
  const outboundUrls = outboundValues.flatMap(
    (value) => value.match(/https?:\/\/[^\s<>"']+/gi) ?? [],
  );
  const unmentionedUrl = outboundUrls.find((url) => !trustedText.includes(url));
  if (unmentionedUrl)
    return `draft contains an outbound URL not supplied by the user: ${unmentionedUrl}`;

  return null;
}

/** Whether a tool needs trusted-user intent before it may execute. */
export function isProtectedAgentTool(toolName: string): boolean {
  return HARD_BLOCKED_TOOL.test(toolName) || Object.hasOwn(TOOL_INTENTS, toolName);
}

/**
 * Authorize a proposed tool call from trusted user turns only.
 * Tool/MCP results and assistant text are deliberately ignored.
 */
export function authorizeAgentToolCall({
  toolName,
  args,
  messages,
}: AgentToolAuthorizationInput): AgentToolAuthorization {
  const turn = getAuthorizationTurn(messages);

  if (HARD_BLOCKED_TOOL.test(toolName)) {
    return {
      allowed: false,
      reason: `${toolName} is outside the agent capability boundary`,
      trustedUserText: turn.latest,
    };
  }

  const intent = Object.hasOwn(TOOL_INTENTS, toolName) ? TOOL_INTENTS[toolName] : undefined;
  if (!intent) {
    return {
      allowed: true,
      reason: 'tool is not protected by the intent gate',
      trustedUserText: turn.latest,
    };
  }

  if (!INTENT_PATTERNS[intent].test(turn.intentText)) {
    return {
      allowed: false,
      reason: `trusted user request does not explicitly authorize ${intent}`,
      trustedUserText: turn.latest,
    };
  }

  if (MAILBOX_SEARCH_TOOLS.has(toolName)) {
    const unsafeScope = mailboxSearchScopeIsAuthorized(args, turn.allTrustedText);
    if (unsafeScope) {
      return { allowed: false, reason: unsafeScope, trustedUserText: turn.latest };
    }
  }

  if (toolName === 'webSearch') {
    const unsafeScope = webSearchScopeIsAuthorized(args, turn.allTrustedText);
    if (unsafeScope) {
      return { allowed: false, reason: unsafeScope, trustedUserText: turn.latest };
    }
  }

  const threadCount = getThreadIds(args).length;
  if (BULK_MUTATIONS.has(toolName) && threadCount > 5 && !turn.confirmed) {
    return {
      allowed: false,
      reason: `${threadCount} threads require a separate explicit confirmation`,
      trustedUserText: turn.latest,
    };
  }

  if (DRAFT_TOOLS.has(toolName)) {
    const unsafeScope = draftScopeIsAuthorized(args, turn.allTrustedText);
    if (unsafeScope) {
      return { allowed: false, reason: unsafeScope, trustedUserText: turn.latest };
    }
  }

  return {
    allowed: true,
    reason: `trusted user explicitly authorized ${intent}`,
    trustedUserText: turn.latest,
  };
}

/** Execute only after the deterministic boundary approves the proposed call. */
export async function executeAuthorizedAgentTool<T>(
  input: AgentToolAuthorizationInput,
  execute: () => T | Promise<T>,
): Promise<T | BlockedAgentToolResult> {
  const authorization = authorizeAgentToolCall(input);
  if (!authorization.allowed) {
    return {
      success: false,
      blocked: true,
      error: `Tool call blocked by trusted-user intent gate: ${authorization.reason}`,
    };
  }

  return execute();
}

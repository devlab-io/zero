// Runtime enums shared across the front→server boundary. These are VALUE enums
// (not `const enum`, not type-only): @zero/types therefore emits JS, consumed at
// runtime by both apps' bundlers. Any switch to `import type` at a call site would
// erase them and break runtime — see ADR 0004.

export enum Tools {
  GetThreadSummary = 'getThreadSummary',
  GetThread = 'getThread',
  ComposeEmail = 'composeEmail',
  DeleteEmail = 'deleteEmail',
  MarkThreadsRead = 'markThreadsRead',
  MarkThreadsUnread = 'markThreadsUnread',
  ModifyLabels = 'modifyLabels',
  GetUserLabels = 'getUserLabels',
  SendEmail = 'sendEmail',
  CreateLabel = 'createLabel',
  BulkDelete = 'bulkDelete',
  BulkArchive = 'bulkArchive',
  DeleteLabel = 'deleteLabel',
  AskZeroMailbox = 'askZeroMailbox',
  AskZeroThread = 'askZeroThread',
  WebSearch = 'webSearch',
  InboxRag = 'inboxRag',
  BuildGmailSearchQuery = 'buildGmailSearchQuery',
  GetCurrentDate = 'getCurrentDate',
}

export enum EPrompts {
  SummarizeMessage = 'SummarizeMessage',
  ReSummarizeThread = 'ReSummarizeThread',
  SummarizeThread = 'SummarizeThread',
  Chat = 'Chat',
  Compose = 'Compose',
  //   ThreadLabels = 'ThreadLabels'
}

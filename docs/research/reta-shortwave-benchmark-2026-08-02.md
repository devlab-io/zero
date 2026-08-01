# Reta collaboration benchmark — official Shortwave sources

Date: 2026-08-02. Scope: email-centred collaboration only. Channels and
standalone internal messages are intentionally excluded.

## Facts documented by Shortwave

- Team collaboration is attached to email threads: internal comments,
  @mentions, team sharing, assignment, completion state and shared labels.
  Source: [Shortwave team guide](https://www.shortwave.com/docs/guides/team/).
- Shortwave exposes keyboard shortcuts for navigation, composition, thread-list
  multi-selection, snoozing and scheduled sending. Source: [Shortwave shortcut
  reference](https://www.shortwave.com/docs/references/shortcuts/).
- Its search language supports structured operators and combinations rather
  than text-only search, including an AI `about:` operator. Source:
  [Shortwave search reference](https://www.shortwave.com/docs/references/search/).
- Its assistant uses mailbox context to draft, refine and autocomplete emails,
  search, analyse threads and support scheduling. Source: [Shortwave AI
  assistant guide](https://www.shortwave.com/docs/guides/ai-assistant/).
- Shortwave supports natural-language snooze and scheduled-send date input.
  Source: [Shortwave shortcut reference](https://www.shortwave.com/docs/references/shortcuts/).
- Its assistant can check availability, prepare calendar events and write
  scheduling emails. Source: [Shortwave AI assistant guide](https://www.shortwave.com/docs/guides/ai-assistant/).
- Shortwave's official changelog says its AI can connect to external tools via
  MCP. This does not establish that Shortwave exposes a public MCP server for
  external assistants. Source: [Shortwave changelog, 3 June
  2025](https://www.shortwave.com/changelog/).

The official sources consulted do not prove that every result carries structured
message-level citations or an embedded, renderable email preview. Those
capabilities are therefore Reta product decisions, not Shortwave facts.

## Reta decisions informed by the benchmark

- Preserve the speed and thread-centred workflow, but keep internal comments
  visually and technically separate from external email replies.
- Make sharing explicit, revocable and ACL-scoped; a mention may grant visible,
  auditable access to that thread only, never invisible mailbox-wide access.
- Protect shared attachments with the exact thread ACL and audit every share,
  assignment, status change and comment creation, edit or deletion.
- Keep keyboard-first list selection and batch actions bounded to the visible
  folder scope, with Escape and undo semantics.
- Make Ask Reta a contextual side panel with connection-scoped sources and
  verified citations. BYOK/model choice never broadens mailbox permissions.
- Extend MCP with exact thread/message ids, structured citations, preview
  resources and an elicitation-gated stored-draft send. No automatic send.
- Parse natural-language snooze input locally with an absolute timezone-aware
  preview before mutation.
- Prepare meetings from thread participants, read only primary-calendar
  free/busy behind the minimal incremental scope, and leave final event save
  and invitation sending to an explicit human action in the calendar provider.

## Deliberate non-goals

- No Slack-like channels.
- No internal chat detached from an email thread.
- No implicit access to an entire mailbox.
- No event creation, invitation send, email send, archive or delete during QA.

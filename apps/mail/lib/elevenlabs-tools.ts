import { trpcClient } from '@/providers/query-provider';
import { log } from '@/lib/log';

/**
 * Normalises a caught value into a display string. tRPC/fetch rejections are
 * always `Error` instances, so this preserves the previous `error.message`
 * behaviour for the real cases while narrowing away the former untyped catch bindings.
 */
const getErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message: unknown };
    return typeof message === 'string' ? message : String(message);
  }
  return undefined;
};

const getCurrentThreadId = () => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    return params.get('threadId');
  }
  return null;
};

const cleanNameDisplay = (name?: string) => {
  if (!name) return '';
  return name.replace(/["<>]/g, '');
};

export const toolExecutors = {
  listEmails: async (params: { folder: string; query: string; maxResults: number }) => {
    try {
      const result = await trpcClient.mail.listThreads.query({
        folder: params.folder || 'INBOX',
        q: params.query,
      });

      const threads = result.threads.slice(0, params.maxResults || 10);

      return {
        success: true,
        threads: threads.map((thread: any) => ({
          id: thread.id,
          subject: thread.subject,
          from: thread.sender,
          date: thread.receivedOn,
          preview: thread.snippet,
          hasUnread: thread.hasUnread,
        })),
      };
    } catch (error) {
      log.error('elevenlabs listEmails failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  getEmail: async (params: { threadId?: string; thread_id?: string; id?: string }) => {
    try {
      // Handle various ways the AI might pass the threadId
      let threadId = null;

      // Check for threadId in various formats
      if (params.threadId && typeof params.threadId === 'string' && params.threadId.trim()) {
        threadId = params.threadId.trim();
      } else if (
        params.thread_id &&
        typeof params.thread_id === 'string' &&
        params.thread_id.trim()
      ) {
        threadId = params.thread_id.trim();
      } else if (params.id && typeof params.id === 'string' && params.id.trim()) {
        threadId = params.id.trim();
      } else {
        // Fall back to current thread from URL
        threadId = getCurrentThreadId();
      }

      if (!threadId) {
        return {
          success: false,
          error: 'No email is currently open. Please open an email first or provide a thread ID.',
          hint: 'You can refer to "this email" or "the current email" when an email is open.',
        };
      }

      const result = await trpcClient.mail.get.query({ id: threadId });
      return {
        success: true,
        thread: result,
        currentThreadId: threadId,
        message: `Retrieved email with thread ID: ${threadId}`,
      };
    } catch (error) {
      log.error('elevenlabs getEmail failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  sendEmail: async (params: {
    to: string[];
    subject: string;
    message: string;
    threadId: string;
  }) => {
    try {
      await trpcClient.mail.send.mutate({
        to: params.to.map((email: string) => ({ email })),
        subject: params.subject,
        message: params.message,
        threadId: params.threadId,
      });
      return { success: true, message: 'Email sent successfully' };
    } catch (error) {
      log.error('elevenlabs sendEmail failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  markAsRead: async (params: { threadIds: string[] }) => {
    try {
      await trpcClient.mail.markAsRead.mutate({ ids: params.threadIds });
      return { success: true, message: 'Emails marked as read' };
    } catch (error) {
      log.error('elevenlabs markAsRead failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  markAsUnread: async (params: { threadIds: string[] }) => {
    try {
      await trpcClient.mail.markAsUnread.mutate({ ids: params.threadIds });
      return { success: true, message: 'Emails marked as unread' };
    } catch (error) {
      log.error('elevenlabs markAsUnread failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  archiveEmails: async (params: { threadIds: string[] }) => {
    try {
      await trpcClient.mail.bulkArchive.mutate({ ids: params.threadIds });
      return { success: true, message: 'Emails archived' };
    } catch (error) {
      log.error('elevenlabs archiveEmails failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  deleteEmails: async (params: { threadIds: string[] }) => {
    try {
      await trpcClient.mail.bulkDelete.mutate({ ids: params.threadIds });
      return { success: true, message: 'Emails moved to trash' };
    } catch (error) {
      log.error('elevenlabs deleteEmails failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  deleteEmail: async () => {
    const threadId = getCurrentThreadId();
    if (!threadId) {
      return {
        success: false,
        error: 'No email is currently open. Please open an email first.',
        hint: 'When an email is open, you can ask me to "delete this email" without specifying an ID.',
      };
    }
    try {
      await trpcClient.mail.bulkDelete.mutate({ ids: [threadId] });
      return { success: true, message: 'Email deleted' };
    } catch (error) {
      log.error('elevenlabs deleteEmail failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  createLabel: async (params: { name: string; backgroundColor: string; textColor: string }) => {
    log.debug('params:', params);

    try {
      await trpcClient.labels.create.mutate({
        name: params.name,
        color: {
          backgroundColor: params.backgroundColor || '#1C2A41',
          textColor: params.textColor || '#D8E6FD',
        },
      });

      return { success: true, message: 'Label created' };
    } catch (error) {
      log.error('elevenlabs createLabel failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  applyLabel: async (params: { label: string; threadIds: string[] }) => {
    try {
      const labels = await trpcClient.labels.list.query();
      const label = labels.find((label) => label.name === params.label);
      if (!label) {
        return { success: false, error: 'Label not found' };
      }

      await trpcClient.mail.modifyLabels.mutate({
        threadId: params.threadIds,
        addLabels: [label.id],
        removeLabels: [],
      });
      return { success: true, message: 'Label applied' };
    } catch (error) {
      log.error('elevenlabs applyLabel failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  removeLabel: async (params: { label: string; threadIds: string[] }) => {
    try {
      const threadId = getCurrentThreadId();
      if (!threadId) {
        return {
          success: false,
          error: 'No email is currently open. Please open an email first.',
          hint: 'When an email is open, you can ask me to "apply a label" without specifying an ID.',
        };
      }

      const thread = await trpcClient.mail.get.query({ id: threadId });
      const labels = thread.labels;
      const label = labels.find((label) => label.name === params.label);
      if (!label) {
        return { success: false, error: 'Label not found' };
      }

      await trpcClient.mail.modifyLabels.mutate({
        threadId: params.threadIds,
        addLabels: [],
        removeLabels: [label.id],
      });
      return { success: true, message: 'Label removed' };
    } catch (error) {
      log.error('elevenlabs removeLabel failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  searchEmails: async (params: { question: string; maxResults?: number }) => {
    try {
      // just a simple search for now
      const result = await trpcClient.mail.listThreads.query({
        q: params.question,
        folder: 'INBOX',
      });

      const threads = result.threads.slice(0, params.maxResults || 5);

      return {
        success: true,
        results: threads.map((thread: any) => ({
          id: thread.id,
          subject: thread.subject,
          from: thread.sender,
          date: thread.receivedOn,
          preview: thread.snippet,
        })),
      };
    } catch (error) {
      log.error('elevenlabs searchEmails failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  webSearch: async (params: { query: string }) => {
    log.debug(params);
    const threadId = getCurrentThreadId();
    if (!threadId) {
      return {
        success: false,
        error: 'No email is currently open. Please open an email first.',
        hint: 'When an email is open, you can ask me to "summarize this email" without specifying an ID.',
      };
    }
    try {
      const thread = await trpcClient.mail.get.query({ id: threadId });

      const emailContent = thread.messages?.map((m) => m.body).join('\n\n') || '';
      const subject = thread.latest?.subject || 'No subject';
      const from = thread.latest?.sender?.email || 'Unknown sender';
      const senderName = cleanNameDisplay(thread.latest?.sender?.name);
      const receivedDate = thread.latest?.receivedOn
        ? new Date(thread.latest.receivedOn).toLocaleString()
        : 'Unknown date';
      const messageCount = thread.messages?.length || 0;

      const emailContextPrompt = `You are analyzing an email thread to answer a specific question.

      EMAIL THREAD CONTEXT:
      - Subject: ${subject}
      - From: ${senderName} (${from})
      - Date: ${receivedDate}
      - Number of messages: ${messageCount}
      - Has unread messages: ${thread.hasUnread ? 'Yes' : 'No'}

      EMAIL CONTENT:
      ${emailContent}

      USER'S QUESTION:
      ${params.query}

      Please provide a focused answer to the user's question based on the email content above. If the question asks for a summary, provide a concise summary. If it asks for specific information, extract and provide just that information. Always base your response on the actual email content provided you can also do web search if needed.`;

      const { text } = await trpcClient.ai.webSearch.mutate({
        query: emailContextPrompt,
      });

      return {
        success: true,
        result: text,
      };
    } catch (error) {
      log.error('elevenlabs webSearch failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
  summarizeEmail: async () => {
    try {
      const threadId = getCurrentThreadId();

      if (!threadId) {
        return {
          success: false,
          error: 'No email is currently open. Please open an email first.',
          hint: 'When an email is open, you can ask me to "summarize this email" without specifying an ID.',
        };
      }

      try {
        const thread = await trpcClient.mail.get.query({ id: threadId });

        const emailContent = thread.messages?.map((m) => m.body).join('\n\n') || '';
        const subject = thread.latest?.subject || 'No subject';
        const from = thread.latest?.sender?.email || 'Unknown sender';
        const senderName = cleanNameDisplay(thread.latest?.sender?.name);
        const receivedDate = thread.latest?.receivedOn
          ? new Date(thread.latest.receivedOn).toLocaleString()
          : 'Unknown date';
        const messageCount = thread.messages?.length || 0;

        const emailSummaryPrompt = `Please provide a concise summary of the following email thread:

        THREAD INFORMATION:
        - Subject: ${subject}
        - From: ${senderName} (${from})
        - Date: ${receivedDate}
        - Number of messages: ${messageCount}
        - Has unread messages: ${thread.hasUnread ? 'Yes' : 'No'}

        EMAIL CONTENT:
        ${emailContent}

        Please provide a brief 2-3 sentence summary covering:
        1. The main topic and purpose
        2. Any key action items or decisions needed
        3. The urgency level`;

        const { text } = await trpcClient.ai.webSearch.mutate({
          query: emailSummaryPrompt,
        });

        return {
          success: true,
          result: {
            threadId: threadId,
            subject: subject,
            from: from,
            senderName: senderName,
            messageCount: messageCount,
            hasUnread: thread.hasUnread,
            summary: text,
            message: `Successfully summarized email thread: ${threadId}`,
          },
        };
      } catch (error) {
        log.error(error);
        return {
          success: false,
          error: 'Failed to fetch email for summarization',
        };
      }
    } catch (error) {
      log.error('elevenlabs summarizeEmail failed', error);
      return { success: false, error: getErrorMessage(error) };
    }
  },
};

import { findHtmlBody, fromBinary } from './utils';
import { findAttachments, parseMessage } from './google-parse';
import type { GmailTransport } from './google-transport';
import type { GmailMessages } from './google-messages';
import type { GmailLabels } from './google-labels';
import type { ParsedMessage } from '../../types';
import type { gmail_v1 } from '@googleapis/gmail';
import { cleanSearchValue } from '../utils';
import { logger } from '../logger';
import * as he from 'he';

export function normalizeSearch(folder: string, q: string) {
  if (folder !== 'inbox') {
    q = cleanSearchValue(q);

    if (folder === 'bin') {
      return { folder: undefined, q: `in:trash ${q}` };
    }
    if (folder === 'archive') {
      return { folder: undefined, q: `in:archive AND (${q})` };
    }
    if (folder === 'draft') {
      return { folder: undefined, q: `is:draft AND (${q})` };
    }

    if (folder === 'snoozed') {
      return { folder: undefined, q: `label:Snoozed AND (${q})` };
    }

    return { folder, q: folder.trim().length ? `in:${folder} ${q}` : q };
  }

  return { folder, q };
}

export class GmailThreads {
  constructor(
    private readonly t: GmailTransport,
    private readonly messages: GmailMessages,
    private readonly labels: GmailLabels,
  ) {}

  public async listHistory<T>(historyId: string): Promise<{ history: T[]; historyId: string }> {
    return this.t.withErrorHandler(
      'listHistory',
      async () => {
        const response = await this.t.execute(
          (gmail) =>
            gmail.users.history.list({
              userId: 'me',
              startHistoryId: historyId,
            }),
          { retry: true },
        );

        const history = response.data.history || [];
        const nextHistoryId = response.data.historyId || historyId;

        return { history: history as T[], historyId: nextHistoryId };
      },
      { historyId },
    );
  }

  public list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string;
  }) {
    const { folder, query: q, maxResults = 100, labelIds: _labelIds = [], pageToken } = params;
    return this.t.withErrorHandler(
      'list',
      async () => {
        const { folder: normalizedFolder, q: normalizedQ } = normalizeSearch(folder, q ?? '');
        const labelIds = [..._labelIds];
        if (normalizedFolder) labelIds.push(normalizedFolder.toUpperCase());

        const res = await this.t.execute(
          (gmail) =>
            gmail.users.threads.list({
              userId: 'me',
              q: normalizedQ ? normalizedQ : undefined,
              labelIds: folder === 'inbox' ? labelIds : [],
              maxResults,
              pageToken: pageToken ? pageToken : undefined,
              quotaUser: this.t.getQuotaUser(),
            }),
          { retry: true },
        );

        const threads = res.data.threads ?? [];

        return {
          threads: threads
            .filter((thread): thread is typeof thread & { id: string } => typeof thread.id === 'string')
            .map((thread) => ({
              id: thread.id,
              historyId: thread.historyId ?? null,
              $raw: thread,
            })),
          nextPageToken: res.data.nextPageToken ?? null,
        };
      },
      { folder, q, maxResults, _labelIds, pageToken, email: this.t.config.auth?.email },
    );
  }

  public get(id: string) {
    return this.t.withErrorHandler(
      'get',
      async () => {
        const res = await this.t.execute(
          (gmail) =>
            gmail.users.threads.get({
              userId: 'me',
              id,
              format: 'full',
              quotaUser: this.t.getQuotaUser(),
            }),
          { retry: true },
        );

        return this.parseThread(res.data);
      },
      { id, email: this.t.config.auth?.email },
    );
  }

  /**
   * Récupère et parse N threads (format full) en UN batch (⌈N/50⌉ round-trips au lieu de N
   * `threads.get`, issue #31). C'est le chemin chaud de sync : le workflow de page (mon
   * territoire) l'utilise via un driver PARTAGÉ, donc les round-trips sont coalescés et le
   * compteur du transport agrège le cycle. `batchThreadsGet` échoue explicitement plutôt que
   * de rendre un sous-ensemble silencieux. Clé = threadId, valeur = thread parsé.
   */
  public async getMany(ids: string[]): Promise<Map<string, Awaited<ReturnType<typeof this.parseThread>>>> {
    const raw = await this.t.batchThreadsGet(ids, 'full');
    const out = new Map<string, Awaited<ReturnType<typeof this.parseThread>>>();
    await Promise.all(
      ids.map(async (id) => {
        const data = raw.get(id);
        if (data) out.set(id, await this.parseThread(data));
      }),
    );
    return out;
  }

  private async parseThread(data: gmail_v1.Schema$Thread) {
    if (!data.messages)
      return {
        messages: [] as ParsedMessage[],
        latest: undefined as ParsedMessage | undefined,
        hasUnread: false,
        totalReplies: 0,
        labels: [] as { id: string; name: string }[],
      };
    let hasUnread = false;
    const labels = new Set<string>();
    const messages: ParsedMessage[] = await Promise.all(
      data.messages.map(async (message) => {
            const bodyData =
              message.payload?.body?.data ||
              (message.payload?.parts ? findHtmlBody(message.payload.parts) : '') ||
              message.payload?.parts?.[0]?.body?.data ||
              '';

            const decodedBody = bodyData
              ? he
                  .decode(fromBinary(bodyData))
                  .replace(/<[^>]*>/g, '')
                  .trim() === fromBinary(bodyData).trim()
                ? he.decode(fromBinary(bodyData).replace(/\n/g, '<br>'))
                : he.decode(fromBinary(bodyData))
              : '';

            let processedBody = decodedBody;
            if (message.payload?.parts) {
              const inlineImages = message.payload.parts.filter((part) => {
                const contentDisposition =
                  part.headers?.find((h) => h.name?.toLowerCase() === 'content-disposition')
                    ?.value || '';
                const isInline = contentDisposition.toLowerCase().includes('inline');
                const hasContentId = part.headers?.some(
                  (h) => h.name?.toLowerCase() === 'content-id',
                );
                return isInline && hasContentId;
              });

              for (const part of inlineImages) {
                const contentId = part.headers?.find(
                  (h) => h.name?.toLowerCase() === 'content-id',
                )?.value;
                if (contentId && part.body?.attachmentId && message.id) {
                  try {
                    const imageData = await this.messages.getAttachment(
                      message.id,
                      part.body.attachmentId,
                    );
                    if (imageData) {
                      const cleanContentId = contentId.replace(/[<>]/g, '');

                      const escapedContentId = cleanContentId.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        '\\$&',
                      );
                      processedBody = processedBody.replace(
                        new RegExp(`cid:${escapedContentId}`, 'g'),
                        `data:${part.mimeType};base64,${imageData}`,
                      );
                    }
                  } catch (error) {
                    logger.debug('Failed to inline Gmail image attachment', {
                      messageId: message.id,
                      attachmentId: part.body?.attachmentId,
                      error,
                    });
                  }
                }
              }
            }

            const parsedData = parseMessage(message);
            if (parsedData.tags) {
              parsedData.tags.forEach((tag) => {
                if (tag.id) {
                  if (labels.has(tag.id)) return;
                  labels.add(tag.id);
                }
              });
            }

            // Only store attachment metadata, not the actual attachment data
            const attachmentParts = message.payload?.parts
              ? findAttachments(message.payload.parts)
              : [];

            const attachments = attachmentParts.map((part) => ({
              filename: part.filename || '',
              mimeType: part.mimeType || '',
              size: Number(part.body?.size || 0),
              attachmentId: part.body?.attachmentId || '',
              headers:
                part.headers?.map((h) => ({
                  name: h.name ?? '',
                  value: h.value ?? '',
                })) ?? [],
              body: '', // Empty body - fetch on demand with getMessageAttachments
            }));

            const fullEmailData = {
              ...parsedData,
              body: '',
              processedHtml: '',
              blobUrl: '',
              decodedBody: processedBody,
              attachments,
            };

            if (fullEmailData.unread) hasUnread = true;

            return fullEmailData;
          }),
        );

    return {
      labels: Array.from(labels).map((id) => ({ id, name: id })),
      messages,
      latest: messages.findLast((e) => e.isDraft !== true),
      hasUnread,
      totalReplies: messages.filter((e) => !e.isDraft).length,
    };
  }

  public markAsRead(threadIds: string[]) {
    return this.t.withErrorHandler(
      'markAsRead',
      async () => {
        const finalIds = await this.collectMessageIdsByUnread(threadIds, true);
        await this.labels.modifyThreadLabels(finalIds, { removeLabelIds: ['UNREAD'] });
      },
      { threadIds },
    );
  }

  public markAsUnread(threadIds: string[]) {
    return this.t.withErrorHandler(
      'markAsUnread',
      async () => {
        const finalIds = await this.collectMessageIdsByUnread(threadIds, false);
        await this.labels.modifyThreadLabels(finalIds, { addLabelIds: ['UNREAD'] });
      },
      { threadIds },
    );
  }

  /**
   * Récupère la métadonnée des threads en UN batch (⌈N/50⌉ round-trips au lieu de N
   * `threads.get` unitaires, issue #31) puis extrait les messageIds selon l'état UNREAD :
   * `wantUnread=true` → messages UNREAD (à marquer lus) ; `false` → messages lus (à marquer
   * non lus). Dédupliqué, sans undefined.
   */
  private async collectMessageIdsByUnread(
    threadIds: string[],
    wantUnread: boolean,
  ): Promise<string[]> {
    const metaByThread = await this.t.batchThreadsGet(threadIds, 'metadata');
    const ids = threadIds.flatMap((id) => {
      const messages = metaByThread.get(id)?.messages ?? [];
      return messages
        .filter((msg) => {
          const isUnread = !!msg.labelIds?.includes('UNREAD');
          return wantUnread ? isUnread : !isUnread;
        })
        .map((msg) => msg.id);
    });
    return [...new Set(ids)].filter((id): id is string => id != null);
  }

  public normalizeIds(ids: string[]) {
    return this.t.withSyncErrorHandler(
      'normalizeIds',
      () => {
        const threadIds: string[] = ids.map((id) =>
          id.startsWith('thread:') ? id.substring(7) : id,
        );
        return { threadIds };
      },
      { ids },
    );
  }

  public deleteAllSpam() {
    return this.t.withErrorHandler(
      'deleteAllSpam',
      async () => {
        let totalDeleted = 0;
        let hasMoreSpam = true;
        let pageToken: string | number | null | undefined = undefined;

        while (hasMoreSpam) {
          const spamThreads = await this.list({
            folder: 'spam',
            maxResults: 500,
            pageToken: pageToken as string | undefined,
          });

          if (!spamThreads.threads || spamThreads.threads.length === 0) {
            hasMoreSpam = false;
            break;
          }

          const threadIds = spamThreads.threads.map((thread) => thread.id);
          await this.labels.modifyLabels(threadIds, {
            addLabels: ['TRASH'],
            removeLabels: ['SPAM', 'INBOX'],
          });

          totalDeleted += threadIds.length;
          pageToken = spamThreads.nextPageToken;

          if (!pageToken) {
            hasMoreSpam = false;
          }
        }

        return {
          success: true,
          message: `Deleted ${totalDeleted} spam emails`,
          count: totalDeleted,
        };
      },
      { email: this.t.config.auth?.email },
    );
  }
}

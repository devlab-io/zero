import {
  isDraftNotFoundError,
  resolveDraftForDeletion,
  threadHasOtherDrafts,
} from './draft-deletion';
import { sanitizeTipTapHtml } from '../sanitize-tip-tap-html';
import { parseMessage, parseOutgoing } from './google-parse';
import type { GmailTransport } from './google-transport';
import type { GmailMessages } from './google-messages';
import type { IOutgoingMessage } from '../../types';
import { normalizeSearch } from './google-threads';
import { type gmail_v1 } from '@googleapis/gmail';
import type { CreateDraftData } from '../schemas';
import { fromBinary } from './utils';
import { logger } from '../logger';
import * as he from 'he';

export class GmailDrafts {
  constructor(
    private readonly t: GmailTransport,
    private readonly messages: GmailMessages,
  ) {}

  /**
   * Envoi direct du brouillon STOCKÉ : drafts.send avec {id} SEUL — Gmail
   * envoie le brouillon tel quel (PJ, destinataires, threading, signature),
   * aucune reconstruction de raw qui pourrait perdre les pièces jointes.
   */
  public sendStoredDraft(draftId: string) {
    return this.t.withErrorHandler(
      'sendStoredDraft',
      async () => {
        await this.t.execute((gmail) =>
          gmail.users.drafts.send({
            userId: 'me',
            requestBody: { id: draftId },
          }),
        );
      },
      { draftId },
    );
  }

  public sendDraft(draftId: string, data: IOutgoingMessage) {
    return this.t.withErrorHandler(
      'sendDraft',
      async () => {
        const { raw } = await parseOutgoing(data, this.t.config);
        await this.t.execute((gmail) =>
          gmail.users.drafts.send({
            userId: 'me',
            requestBody: {
              id: draftId,
              message: {
                raw,
                id: draftId,
              },
            },
          }),
        );
      },
      { draftId, data },
    );
  }

  public deleteDraft(draftId: string) {
    return this.t.withErrorHandler(
      'deleteDraft',
      async (): Promise<{
        messageId: string | null;
        threadId: string | null;
        threadGone: boolean;
        hasOtherDrafts: boolean;
      }> => {
        // CUA rounds 5-6 (échec B) : l'id fourni peut être un id de MESSAGE de
        // brouillon ou un id de brouillon périmé — drafts.delete répondait 404
        // en silence. Résolution d'identifiants AVANT suppression (drafts.get,
        // puis remapping exact draft.id/message.id via drafts.list — jamais un
        // autre brouillon), succès idempotent si le brouillon n'existe plus,
        // puis relevé de l'état du fil pour que l'appelant (ZeroDriver) nettoie
        // la projection locale avec des identifiants exacts.
        let resolvedId: string | null = draftId;
        let messageId: string | null = null;
        let threadId: string | null = null;

        try {
          const got = await this.t.execute((gmail) =>
            gmail.users.drafts.get({
              userId: 'me',
              id: draftId,
              format: 'minimal',
              quotaUser: this.t.getQuotaUser(),
            }),
          );
          messageId = got.data.message?.id ?? null;
          threadId = got.data.message?.threadId ?? null;
        } catch (error) {
          if (!isDraftNotFoundError(error)) throw error;
          const res = await this.t.execute((gmail) =>
            gmail.users.drafts.list({
              userId: 'me',
              maxResults: 100,
            }),
          );
          resolvedId = resolveDraftForDeletion(res.data.drafts ?? [], draftId);
          if (!resolvedId) {
            // déjà supprimé — idempotent
            return { messageId: null, threadId: null, threadGone: false, hasOtherDrafts: false };
          }
          const entry = (res.data.drafts ?? []).find((d) => d.id === resolvedId);
          messageId = entry?.message?.id ?? null;
          threadId = (entry?.message as { threadId?: string } | undefined)?.threadId ?? null;
        }

        await this.t.execute((gmail) =>
          gmail.users.drafts.delete({
            userId: 'me',
            id: resolvedId,
            quotaUser: this.t.getQuotaUser(),
          }),
        );

        if (!threadId) return { messageId, threadId, threadGone: false, hasOtherDrafts: false };

        try {
          const thread = await this.t.execute((gmail) =>
            gmail.users.threads.get({
              userId: 'me',
              id: threadId,
              format: 'minimal',
              quotaUser: this.t.getQuotaUser(),
            }),
          );
          return {
            messageId,
            threadId,
            threadGone: false,
            hasOtherDrafts: threadHasOtherDrafts(thread.data.messages ?? [], messageId),
          };
        } catch (error) {
          if (!isDraftNotFoundError(error)) throw error;
          // Le fil n'existe plus : le brouillon supprimé était son seul message.
          return { messageId, threadId, threadGone: true, hasOtherDrafts: false };
        }
      },
      { draftId },
    );
  }

  public getDraft(draftId: string) {
    return this.t.withErrorHandler(
      'getDraft',
      async () => {
        const res = await this.t.execute((gmail) =>
          gmail.users.drafts.get({
            userId: 'me',
            id: draftId,
            format: 'full',
          }),
        );

        if (!res.data) {
          throw new Error('Draft not found');
        }

        const parsedDraft = await this.parseDraft(res.data);
        if (!parsedDraft) {
          throw new Error('Failed to parse draft');
        }

        return parsedDraft;
      },
      { draftId },
    );
  }

  public listDrafts(params: { q?: string; maxResults?: number; pageToken?: string }) {
    const { q, maxResults = 20, pageToken } = params;
    return this.t.withErrorHandler(
      'listDrafts',
      async () => {
        const { q: normalizedQ } = normalizeSearch('draft', q ?? '');
        const res = await this.t.execute((gmail) =>
          gmail.users.drafts.list({
            userId: 'me',
            q: normalizedQ ? normalizedQ : undefined,
            maxResults,
            pageToken: pageToken ? pageToken : undefined,
          }),
        );

        const drafts = await Promise.all(
          (res.data.drafts || []).map(async (draft) => {
            if (!draft.id) return null;
            const draftId = draft.id;
            try {
              const msg = await this.t.execute((gmail) =>
                gmail.users.drafts.get({
                  userId: 'me',
                  id: draftId,
                  format: 'full',
                }),
              );
              const message = msg.data.message;
              if (!message) return null;

              const parsed = parseMessage(message);
              const headers = message.payload?.headers || [];
              const date = headers.find((h) => h.name?.toLowerCase() === 'date')?.value;

              return {
                ...parsed,
                id: draft.id,
                threadId: draft.message?.id,
                receivedOn: date || new Date().toISOString(),
              };
            } catch {
              return null;
            }
          }),
        );

        const sortedDrafts = [...drafts]
          .filter((draft) => draft !== null)
          .sort((a, b) => {
            const dateA = new Date(a?.receivedOn || new Date()).getTime();
            const dateB = new Date(b?.receivedOn || new Date()).getTime();
            return dateB - dateA;
          });

        return {
          threads: sortedDrafts.map((draft) => ({
            id: draft.id,
            historyId: draft.threadId ?? null,
            $raw: draft,
          })),
          nextPageToken: res.data.nextPageToken ?? null,
        };
      },
      { q, maxResults, pageToken },
    );
  }

  public createDraft(data: CreateDraftData) {
    return this.t.withErrorHandler(
      'createDraft',
      async () => {
        const { html: message, inlineImages } = await sanitizeTipTapHtml(data.message);
        const { createMimeMessage } = await import('mimetext');
        const msg = createMimeMessage();
        msg.setSender('me');
        // name <email@example.com>
        const to = data.to.split(', ').map((recipient: string) => {
          if (recipient.includes('<')) {
            const [name, email] = recipient.split('<');
            return { addr: email.replace('>', ''), name: name.replace('>', '') };
          }
          return { addr: recipient };
        });

        msg.setTo(to);
        if (data.cc)
          msg.setCc(data.cc?.split(', ').map((recipient: string) => ({ addr: recipient })));
        if (data.bcc)
          msg.setBcc(data.bcc?.split(', ').map((recipient: string) => ({ addr: recipient })));

        msg.setSubject(data.subject);
        msg.addMessage({
          contentType: 'text/html',
          data: message || '',
        });

        if (inlineImages.length > 0) {
          for (const image of inlineImages) {
            msg.addAttachment({
              inline: true,
              filename: `${image.cid}`,
              contentType: image.mimeType,
              data: image.data,
              headers: {
                'Content-ID': `<${image.cid}>`,
                'Content-Disposition': 'inline',
              },
            });
          }
        }

        if (data.attachments && data.attachments?.length > 0) {
          for (const attachment of data.attachments) {
            let base64Data: string | undefined;
            const att = attachment as {
              base64?: unknown;
              arrayBuffer?: () => Promise<ArrayBuffer>;
            };
            if (typeof att.base64 === 'string') base64Data = att.base64;
            else if (typeof att.arrayBuffer === 'function') {
              const buffer = Buffer.from(await att.arrayBuffer());
              base64Data = buffer.toString('base64');
            }

            if (!base64Data) continue;

            msg.addAttachment({
              filename: attachment.name,
              contentType: attachment.type || 'application/octet-stream',
              data: base64Data,
            });
          }
        }

        const mimeMessage = msg.asRaw();
        const encodedMessage = Buffer.from(mimeMessage)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const requestBody = {
          message: {
            raw: encodedMessage,
            threadId: data.threadId,
          },
        };

        let res;

        if (data.id) {
          const draftId = data.id;
          res = await this.t.execute((gmail) =>
            gmail.users.drafts.update({
              userId: 'me',
              id: draftId,
              requestBody,
            }),
          );
        } else {
          res = await this.t.execute((gmail) =>
            gmail.users.drafts.create({
              userId: 'me',
              requestBody,
            }),
          );
        }

        return res.data;
      },
      { data },
    );
  }

  private async parseDraft(draft: gmail_v1.Schema$Draft) {
    if (!draft.message) return null;

    const headers = draft.message.payload?.headers || [];
    const to =
      headers
        .find((h) => h.name === 'To')
        ?.value?.split(',')
        .map((e) => e.trim())
        .filter(Boolean) || [];

    const subject = headers.find((h) => h.name === 'Subject')?.value;

    const cc =
      draft.message.payload?.headers?.find((h) => h.name === 'Cc')?.value?.split(',') || [];
    const bcc =
      draft.message.payload?.headers?.find((h) => h.name === 'Bcc')?.value?.split(',') || [];

    const payload = draft.message.payload;
    let content = '';
    let attachments: {
      filename: string;
      mimeType: string;
      size: number;
      attachmentId: string;
      headers: { name: string; value: string }[];
      body: string;
    }[] = [];

    if (payload?.parts) {
      //  Get body
      const htmlPart = payload.parts.find((part) => part.mimeType === 'text/html');
      if (htmlPart?.body?.data) {
        content = fromBinary(htmlPart.body.data);
      }

      //  Get attachments
      const attachmentParts = payload.parts.filter(
        (part) => !!part.filename && !!part.body?.attachmentId,
      );

      attachments = await Promise.all(
        attachmentParts.map(async (part) => {
          // attachmentParts is already filtered on part.body?.attachmentId, but TS
          // does not narrow across .filter(); re-derive and skip (like the catch below
          // returns null) if the ids are somehow absent instead of asserting non-null.
          const messageId = draft.message?.id;
          const attachmentId = part.body?.attachmentId;
          if (!messageId || !attachmentId) return null;
          try {
            const attachmentData = await this.messages.getAttachment(messageId, attachmentId);
            return {
              filename: part.filename || '',
              mimeType: part.mimeType || '',
              size: Number(part.body?.size || 0),
              attachmentId,
              headers:
                part.headers?.map((h) => ({
                  name: h.name ?? '',
                  value: h.value ?? '',
                })) ?? [],
              body: attachmentData ?? '',
            };
          } catch (e) {
            logger.error('Failed to get attachment', e);
            return null;
          }
        }),
      ).then((a) => a.filter((a): a is NonNullable<typeof a> => a !== null));
    } else if (payload?.body?.data) {
      content = fromBinary(payload.body.data);
    }

    return {
      id: draft.id || '',
      to,
      subject: subject ? he.decode(subject).trim() : '',
      content,
      rawMessage: draft.message,
      cc,
      bcc,
      attachments,
    };
  }
}

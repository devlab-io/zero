import { parseMessage, parseOutgoing } from './google-parse';
import type { GmailTransport } from './google-transport';
import type { GmailMessages } from './google-messages';
import { normalizeSearch } from './google-threads';
import { type gmail_v1 } from '@googleapis/gmail';
import type { CreateDraftData } from '../schemas';
import { sanitizeTipTapHtml } from '../sanitize-tip-tap-html';
import type { IOutgoingMessage } from '../../types';
import { createMimeMessage } from 'mimetext';
import { fromBinary } from './utils';
import * as he from 'he';

export class GmailDrafts {
  constructor(
    private readonly t: GmailTransport,
    private readonly messages: GmailMessages,
  ) {}

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
      async () => {
        await this.t.execute((gmail) =>
          gmail.users.drafts.delete({
            userId: 'me',
            id: draftId,
            quotaUser: this.t.getQuotaUser(),
          }),
        );
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
            const att = attachment as { base64?: unknown; arrayBuffer?: () => Promise<ArrayBuffer> };
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
          try {
            const attachmentData = await this.messages.getAttachment(
              draft.message!.id!,
              part.body!.attachmentId!,
            );
            return {
              filename: part.filename || '',
              mimeType: part.mimeType || '',
              size: Number(part.body?.size || 0),
              attachmentId: part.body!.attachmentId!,
              headers:
                part.headers?.map((h) => ({
                  name: h.name ?? '',
                  value: h.value ?? '',
                })) ?? [],
              body: attachmentData ?? '',
            };
          } catch (e) {
            console.error('Failed to get attachment', e);
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

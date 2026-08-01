// V2.4 shared-types-package (issue #25): IGetThreadResponse(+Schema) et ParsedDraft
// vivent dans @zero/types ; ré-export arrière pour MailManager (ci-dessous) et pour
// trpc/routes/mail.ts (.output(IGetThreadResponseSchema)). Voir ADR 0004.
import { IGetThreadResponseSchema, type IGetThreadResponse, type ParsedDraft } from '@zero/types';
import type { IOutgoingMessage, Label, DeleteAllSpamResponse } from '../../types';
import type { CreateDraftData } from '../schemas';
import { z } from 'zod';

export { IGetThreadResponseSchema };
export type { IGetThreadResponse, ParsedDraft };

export interface IConfig {
  auth?: {
    access_token: string;
    refresh_token: string;
    email: string;
  };
}

export type ManagerConfig = {
  auth: {
    userId: string;
    // accountId: string;
    accessToken: string;
    refreshToken: string;
    email: string;
  };
};

export interface MailManager {
  config: ManagerConfig;
  getMessageAttachments(
    id: string,
    options?: { inlineOnly?: boolean },
  ): Promise<
    {
      filename: string;
      mimeType: string;
      size: number;
      attachmentId: string;
      contentId: string | null;
      headers: { name: string; value: string }[];
      body: string;
    }[]
  >;
  get(id: string): Promise<IGetThreadResponse>;
  create(data: IOutgoingMessage): Promise<{ id?: string | null }>;
  sendDraft(id: string, data: IOutgoingMessage): Promise<void>;
  /**
   * Envoi du brouillon TEL QUE STOCKÉ chez le fournisseur (aucune
   * reconstruction du corps) : PJ, destinataires, threading et signature du
   * brouillon sont préservés par le fournisseur lui-même.
   */
  sendStoredDraft(id: string): Promise<void>;
  createDraft(
    data: CreateDraftData,
  ): Promise<{ id?: string | null; success?: boolean; error?: string }>;
  getDraft(id: string): Promise<ParsedDraft>;
  listDrafts(params: { q?: string; maxResults?: number; pageToken?: string }): Promise<{
    threads: { id: string; historyId: string | null; $raw: unknown }[];
    nextPageToken: string | null;
  }>;
  delete(id: string): Promise<void>;
  deleteDraft(id: string): Promise<{
    messageId: string | null;
    threadId: string | null;
    threadGone: boolean;
    hasOtherDrafts: boolean;
  }>;
  list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string | number;
  }): Promise<{
    threads: { id: string; historyId: string | null; $raw?: unknown }[];
    nextPageToken: string | null;
  }>;
  count(): Promise<{ count?: number; label?: string }[]>;
  /** Exact provider totals for the four mailbox counters shown in the primary navigation. */
  getMailboxCounts(): Promise<{ inbox: number; drafts: number; sent: number }>;
  getTokens(
    code: string,
  ): Promise<{ tokens: { access_token?: string; refresh_token?: string; expiry_date?: number } }>;
  getUserInfo(
    tokens?: ManagerConfig['auth'],
  ): Promise<{ address: string; name: string; photo: string }>;
  getScope(): string;
  listHistory<T>(historyId: string): Promise<{ history: T[]; historyId: string }>;
  markAsRead(threadIds: string[]): Promise<void>;
  markAsUnread(threadIds: string[]): Promise<void>;
  normalizeIds(id: string[]): { threadIds: string[] };
  modifyLabels(
    id: string[],
    options: { addLabels: string[]; removeLabels: string[] },
  ): Promise<void>;
  getAttachment(messageId: string, attachmentId: string): Promise<string | undefined>;
  getUserLabels(): Promise<Label[]>;
  getLabel(id: string): Promise<Label>;
  createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }): Promise<void>;
  updateLabel(
    id: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ): Promise<void>;
  deleteLabel(id: string): Promise<void>;
  getEmailAliases(): Promise<{ email: string; name?: string; primary?: boolean }[]>;
  revokeToken(token: string): Promise<boolean>;
  deleteAllSpam(): Promise<DeleteAllSpamResponse>;
  getRawEmail(id: string): Promise<string>;
}

export interface IGetThreadsResponse {
  threads: { id: string; historyId: string | null; $raw?: unknown }[];
  nextPageToken: string | null;
}

export const IGetThreadsResponseSchema = z.object({
  threads: z.array(
    z.object({
      id: z.string(),
      historyId: z.string().nullable(),
      $raw: z.unknown().optional(),
    }),
  ),
  nextPageToken: z.string().nullable(),
});

import type { IOutgoingMessage, Label } from '../../types';
import type { MailManager, ManagerConfig } from './types';
import { GmailTransport } from './google-transport';
import { GmailMessages } from './google-messages';
import { GmailLabels } from './google-labels';
import { GmailThreads } from './google-threads';
import { GmailDrafts } from './google-drafts';
import { GmailAccount } from './google-account';
import type { CreateDraftData } from '../schemas';

/**
 * GoogleMailManager — point d'entrée du driver Google.
 *
 * Façade de délégation PURE (aucune logique métier) vers les modules de domaine.
 * L'interface {@link MailManager} et les consommateurs (`createDriver` dans
 * `./index.ts`, trpc, agent, workflows) restent inchangés : construction via
 * `new GoogleMailManager(config)`, mêmes 30 méthodes, mêmes signatures.
 *
 * Découpage (voir `docs/jobs/niveau9/refactor-google-driver-01.md`) :
 * - `google-transport.ts`  — exécution HTTP Gmail (couture #31) + auth + erreurs
 * - `google-parse.ts`      — (dé)sérialisation MIME/message (pur)
 * - `google-messages.ts`   — messages, pièces jointes, envoi, brut
 * - `google-threads.ts`    — threads, liste, lecture, spam, historique
 * - `google-labels.ts`     — labels, resolveLabelId, modifyThreadLabels, count
 * - `google-drafts.ts`     — brouillons
 * - `google-account.ts`    — tokens, profil, alias, révocation
 */
export class GoogleMailManager implements MailManager {
  private readonly transport: GmailTransport;
  private readonly messages: GmailMessages;
  private readonly labels: GmailLabels;
  private readonly threads: GmailThreads;
  private readonly drafts: GmailDrafts;
  private readonly account: GmailAccount;

  constructor(public config: ManagerConfig) {
    this.transport = new GmailTransport(config);
    this.messages = new GmailMessages(this.transport);
    this.labels = new GmailLabels(this.transport);
    this.threads = new GmailThreads(this.transport, this.messages, this.labels);
    this.drafts = new GmailDrafts(this.transport, this.messages);
    this.account = new GmailAccount(this.transport);
  }

  public getScope(): string {
    return this.transport.getScope();
  }

  // --- threads ---
  public listHistory<T>(historyId: string): Promise<{ history: T[]; historyId: string }> {
    return this.threads.listHistory<T>(historyId);
  }
  public list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string;
  }) {
    return this.threads.list(params);
  }
  public get(id: string) {
    return this.threads.get(id);
  }
  public markAsRead(threadIds: string[]) {
    return this.threads.markAsRead(threadIds);
  }
  public markAsUnread(threadIds: string[]) {
    return this.threads.markAsUnread(threadIds);
  }
  public normalizeIds(ids: string[]) {
    return this.threads.normalizeIds(ids);
  }
  public deleteAllSpam() {
    return this.threads.deleteAllSpam();
  }

  // --- messages ---
  public getAttachment(messageId: string, attachmentId: string) {
    return this.messages.getAttachment(messageId, attachmentId);
  }
  public getMessageAttachments(messageId: string) {
    return this.messages.getMessageAttachments(messageId);
  }
  public create(data: IOutgoingMessage) {
    return this.messages.create(data);
  }
  public delete(id: string) {
    return this.messages.delete(id);
  }
  public getRawEmail(messageId: string) {
    return this.messages.getRawEmail(messageId);
  }

  // --- labels ---
  public count() {
    return this.labels.count();
  }
  public getUserLabels() {
    return this.labels.getUserLabels();
  }
  public getLabel(labelId: string): Promise<Label> {
    return this.labels.getLabel(labelId);
  }
  public createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }) {
    return this.labels.createLabel(label);
  }
  public updateLabel(id: string, label: Label) {
    return this.labels.updateLabel(id, label);
  }
  public deleteLabel(id: string) {
    return this.labels.deleteLabel(id);
  }
  public modifyLabels(
    threadIds: string[],
    addOrOptions: { addLabels: string[]; removeLabels: string[] } | string[],
    maybeRemove?: string[],
  ) {
    return this.labels.modifyLabels(threadIds, addOrOptions, maybeRemove);
  }

  // --- drafts ---
  public sendDraft(draftId: string, data: IOutgoingMessage) {
    return this.drafts.sendDraft(draftId, data);
  }
  public deleteDraft(draftId: string) {
    return this.drafts.deleteDraft(draftId);
  }
  public getDraft(draftId: string) {
    return this.drafts.getDraft(draftId);
  }
  public listDrafts(params: { q?: string; maxResults?: number; pageToken?: string }) {
    return this.drafts.listDrafts(params);
  }
  public createDraft(data: CreateDraftData) {
    return this.drafts.createDraft(data);
  }

  // --- account ---
  public getTokens<T>(code: string) {
    return this.account.getTokens<T>(code);
  }
  public getUserInfo() {
    return this.account.getUserInfo();
  }
  public getEmailAliases() {
    return this.account.getEmailAliases();
  }
  public revokeToken(token: string) {
    return this.account.revokeToken(token);
  }
}

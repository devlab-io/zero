// Durable Object database layer, extracted from main.ts during the V2.3
// routing-consolidation (issue devlab-io/zero#24). Pure move: the DbRpcDO
// (RpcTarget façade) and ZeroDB (SQLite-backed DurableObject) classes below
// are unchanged; main.ts re-exports them so the wrangler `ZERO_DB` binding and
// exported-class surface are identical. No routing logic lives here.
import {
  deleteRetaCredentialTx,
  selectRetaModelTx,
  type SelectRetaModelParams,
  type SelectRetaModelResult,
  type VaultTxStore,
} from '../lib/ask-reta/vault-transactions';
import {
  account,
  connection,
  note,
  retaByokCredential,
  session,
  user,
  userHotkeys,
  userSettings,
  writingStyleMatrix,
  emailTemplate,
} from './schema';
import {
  createUpdatedMatrixFromNewEmail,
  initializeStyleMatrixFromEmail,
  type EmailMatrix,
  type WritingStyleMatrix,
} from '../services/writing-style-service';
import { DurableObject, RpcTarget } from 'cloudflare:workers';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { defaultUserSettings } from '../lib/schemas';
import { createDb, type DB } from './index';
import { EProviders } from '../types';
import type { ZeroEnv } from '../env';

export class DbRpcDO extends RpcTarget {
  constructor(
    private mainDo: ZeroDB,
    private userId: string,
  ) {
    super();
  }

  async findUser(): Promise<typeof user.$inferSelect | undefined> {
    return await this.mainDo.findUser(this.userId);
  }

  async findUserConnection(
    connectionId: string,
  ): Promise<typeof connection.$inferSelect | undefined> {
    return await this.mainDo.findUserConnection(this.userId, connectionId);
  }

  async updateUser(data: Partial<typeof user.$inferInsert>) {
    return await this.mainDo.updateUser(this.userId, data);
  }

  async deleteConnection(connectionId: string) {
    return await this.mainDo.deleteConnection(connectionId, this.userId);
  }

  async findFirstConnection(): Promise<typeof connection.$inferSelect | undefined> {
    return await this.mainDo.findFirstConnection(this.userId);
  }

  async findManyConnections(): Promise<(typeof connection.$inferSelect)[]> {
    return await this.mainDo.findManyConnections(this.userId);
  }

  async findManyNotesByThreadId(threadId: string): Promise<(typeof note.$inferSelect)[]> {
    return await this.mainDo.findManyNotesByThreadId(this.userId, threadId);
  }

  async createNote(payload: Omit<typeof note.$inferInsert, 'userId'>) {
    return await this.mainDo.createNote(this.userId, payload as typeof note.$inferInsert);
  }

  async updateNote(noteId: string, payload: Partial<typeof note.$inferInsert>) {
    return await this.mainDo.updateNote(this.userId, noteId, payload);
  }

  async updateManyNotes(
    notes: { id: string; order: number; isPinned?: boolean | null }[],
  ): Promise<boolean> {
    return await this.mainDo.updateManyNotes(this.userId, notes);
  }

  async findManyNotesByIds(noteIds: string[]): Promise<(typeof note.$inferSelect)[]> {
    return await this.mainDo.findManyNotesByIds(this.userId, noteIds);
  }

  async deleteNote(noteId: string) {
    return await this.mainDo.deleteNote(this.userId, noteId);
  }

  async findNoteById(noteId: string): Promise<typeof note.$inferSelect | undefined> {
    return await this.mainDo.findNoteById(this.userId, noteId);
  }

  async findHighestNoteOrder(): Promise<{ order: number } | undefined> {
    return await this.mainDo.findHighestNoteOrder(this.userId);
  }

  async deleteUser() {
    return await this.mainDo.deleteUser(this.userId);
  }

  async findUserSettings(): Promise<typeof userSettings.$inferSelect | undefined> {
    return await this.mainDo.findUserSettings(this.userId);
  }

  async findUserHotkeys(): Promise<(typeof userHotkeys.$inferSelect)[]> {
    return await this.mainDo.findUserHotkeys(this.userId);
  }

  async insertUserHotkeys(shortcuts: (typeof userHotkeys.$inferInsert)[]) {
    return await this.mainDo.insertUserHotkeys(this.userId, shortcuts);
  }

  async insertUserSettings(settings: typeof defaultUserSettings) {
    return await this.mainDo.insertUserSettings(this.userId, settings);
  }

  async updateUserSettings(settings: typeof defaultUserSettings) {
    return await this.mainDo.updateUserSettings(this.userId, settings);
  }

  async createConnection(
    providerId: EProviders,
    email: string,
    updatingInfo: {
      expiresAt: Date;
      scope: string;
    },
  ): Promise<{ id: string }[]> {
    return await this.mainDo.createConnection(providerId, email, this.userId, updatingInfo);
  }

  async findConnectionById(
    connectionId: string,
  ): Promise<typeof connection.$inferSelect | undefined> {
    return await this.mainDo.findConnectionById(connectionId);
  }

  async syncUserMatrix(connectionId: string, emailStyleMatrix: EmailMatrix) {
    return await this.mainDo.syncUserMatrix(connectionId, emailStyleMatrix);
  }

  async findWritingStyleMatrix(
    connectionId: string,
  ): Promise<typeof writingStyleMatrix.$inferSelect | undefined> {
    return await this.mainDo.findWritingStyleMatrix(connectionId);
  }

  async deleteActiveConnection(connectionId: string) {
    return await this.mainDo.deleteActiveConnection(this.userId, connectionId);
  }

  async updateConnection(
    connectionId: string,
    updatingInfo: Partial<typeof connection.$inferInsert>,
  ) {
    return await this.mainDo.updateConnection(connectionId, updatingInfo);
  }

  async listEmailTemplates(): Promise<(typeof emailTemplate.$inferSelect)[]> {
    return await this.mainDo.findManyEmailTemplates(this.userId);
  }

  async createEmailTemplate(payload: Omit<typeof emailTemplate.$inferInsert, 'userId'>) {
    return await this.mainDo.createEmailTemplate(this.userId, payload);
  }

  async deleteEmailTemplate(templateId: string) {
    return await this.mainDo.deleteEmailTemplate(this.userId, templateId);
  }

  async updateEmailTemplate(templateId: string, data: Partial<typeof emailTemplate.$inferInsert>) {
    return await this.mainDo.updateEmailTemplate(this.userId, templateId, data);
  }

  // --- Ask Reta BYOK vault (slice 3A) --------------------------------------
  // Scoping is STRUCTURAL: this façade injects its own userId — no route can
  // name a user, so user A cannot find/list/replace/delete user B's rows.

  async findRetaByokCredential(provider: string) {
    return await this.mainDo.findRetaByokCredential(this.userId, provider);
  }

  async listRetaByokCredentialStatus() {
    return await this.mainDo.listRetaByokCredentialStatus(this.userId);
  }

  async replaceRetaByokCredential(data: {
    id: string;
    provider: string;
    ciphertext: string;
    iv: string;
    wrappedDek: string;
    wrapIv: string;
    kekVersion: string;
    consentVersion: string;
  }) {
    return await this.mainDo.replaceRetaByokCredential(this.userId, data);
  }

  async deleteRetaByokCredentialAndResetModel(
    provider: string,
    resetModelIds: string[],
    fallbackModelId: string,
  ) {
    return await this.mainDo.deleteRetaByokCredentialAndResetModel(
      this.userId,
      provider,
      resetModelIds,
      fallbackModelId,
    );
  }

  async selectRetaModel(params: SelectRetaModelParams): Promise<SelectRetaModelResult> {
    return await this.mainDo.selectRetaModel(this.userId, params);
  }

  async rewrapRetaByokCredential(
    provider: string,
    params: {
      id: string;
      expectedKekVersion: string;
      wrappedDek: string;
      wrapIv: string;
      kekVersion: string;
    },
  ): Promise<boolean> {
    return await this.mainDo.rewrapRetaByokCredential(this.userId, provider, params);
  }
}

export class ZeroDB extends DurableObject<ZeroEnv> {
  db: DB = createDb(this.env.HYPERDRIVE.connectionString).db;

  // Ce DO est dédié à un utilisateur (idFromName(userId)) et toutes les écritures
  // user/connection transitent par lui : un cache mémoire local invalidé par ces
  // écritures est donc sûr. Il évite 2 à 3 requêtes Postgres séquentielles sur
  // chaque requête authentifiée.
  private activeConnectionCache: {
    userId: string;
    data: typeof connection.$inferSelect;
    expiresAt: number;
  } | null = null;
  // 10 min: every user/connection write transits through this DO and invalidates
  // the cache (resetConnection included, routed via updateConnection), so a long
  // TTL only expires on idle eviction.
  private static readonly ACTIVE_CONNECTION_TTL_MS = 600_000;

  private invalidateActiveConnectionCache() {
    this.activeConnectionCache = null;
  }

  async setMetaData(userId: string) {
    return new DbRpcDO(this, userId);
  }

  /**
   * Connexion active (défaut de l'utilisateur, sinon première) en UN SEUL RPC.
   * Remplace la cascade setMetaData → findUser → findUserConnection du chemin chaud.
   */
  async getActiveConnection(userId: string): Promise<typeof connection.$inferSelect | undefined> {
    const cached = this.activeConnectionCache;
    if (cached && cached.userId === userId && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const userData = await this.findUser(userId);
    let active = userData?.defaultConnectionId
      ? await this.findUserConnection(userId, userData.defaultConnectionId)
      : undefined;
    if (!active) active = await this.findFirstConnection(userId);

    if (active) {
      this.activeConnectionCache = {
        userId,
        data: active,
        expiresAt: Date.now() + ZeroDB.ACTIVE_CONNECTION_TTL_MS,
      };
    }
    return active;
  }

  async findUser(userId: string): Promise<typeof user.$inferSelect | undefined> {
    return await this.db.query.user.findFirst({
      where: eq(user.id, userId),
    });
  }

  async findUserConnection(
    userId: string,
    connectionId: string,
  ): Promise<typeof connection.$inferSelect | undefined> {
    return await this.db.query.connection.findFirst({
      where: and(eq(connection.userId, userId), eq(connection.id, connectionId)),
    });
  }

  async updateUser(userId: string, data: Partial<typeof user.$inferInsert>) {
    this.invalidateActiveConnectionCache();
    return await this.db.update(user).set(data).where(eq(user.id, userId));
  }

  async deleteConnection(connectionId: string, userId: string) {
    this.invalidateActiveConnectionCache();
    const connections = await this.findManyConnections(userId);
    if (connections.length <= 1) {
      throw new Error('Cannot delete the last connection. At least one connection is required.');
    }
    return await this.db
      .delete(connection)
      .where(and(eq(connection.id, connectionId), eq(connection.userId, userId)));
  }

  async findFirstConnection(userId: string): Promise<typeof connection.$inferSelect | undefined> {
    return await this.db.query.connection.findFirst({
      where: eq(connection.userId, userId),
    });
  }

  async findManyConnections(userId: string): Promise<(typeof connection.$inferSelect)[]> {
    return await this.db.query.connection.findMany({
      where: eq(connection.userId, userId),
    });
  }

  async findManyNotesByThreadId(
    userId: string,
    threadId: string,
  ): Promise<(typeof note.$inferSelect)[]> {
    return await this.db.query.note.findMany({
      where: and(eq(note.userId, userId), eq(note.threadId, threadId)),
      orderBy: [desc(note.isPinned), asc(note.order), desc(note.createdAt)],
    });
  }

  async createNote(userId: string, payload: typeof note.$inferInsert) {
    return await this.db
      .insert(note)
      .values({
        ...payload,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
  }

  async updateNote(
    userId: string,
    noteId: string,
    payload: Partial<typeof note.$inferInsert>,
  ): Promise<typeof note.$inferSelect | undefined> {
    const [updated] = await this.db
      .update(note)
      .set({
        ...payload,
        updatedAt: new Date(),
      })
      .where(and(eq(note.id, noteId), eq(note.userId, userId)))
      .returning();
    return updated;
  }

  async updateManyNotes(
    userId: string,
    notes: { id: string; order: number; isPinned?: boolean | null }[],
  ): Promise<boolean> {
    return await this.db.transaction(async (tx) => {
      for (const n of notes) {
        const updateData: Record<string, unknown> = {
          order: n.order,
          updatedAt: new Date(),
        };

        if (n.isPinned !== undefined) {
          updateData.isPinned = n.isPinned;
        }
        await tx
          .update(note)
          .set(updateData)
          .where(and(eq(note.id, n.id), eq(note.userId, userId)));
      }
      return true;
    });
  }

  async findManyNotesByIds(
    userId: string,
    noteIds: string[],
  ): Promise<(typeof note.$inferSelect)[]> {
    return await this.db.query.note.findMany({
      where: and(eq(note.userId, userId), inArray(note.id, noteIds)),
    });
  }

  async deleteNote(userId: string, noteId: string) {
    return await this.db.delete(note).where(and(eq(note.id, noteId), eq(note.userId, userId)));
  }

  async findNoteById(
    userId: string,
    noteId: string,
  ): Promise<typeof note.$inferSelect | undefined> {
    return await this.db.query.note.findFirst({
      where: and(eq(note.id, noteId), eq(note.userId, userId)),
    });
  }

  async findHighestNoteOrder(userId: string): Promise<{ order: number } | undefined> {
    return await this.db.query.note.findFirst({
      where: eq(note.userId, userId),
      orderBy: desc(note.order),
      columns: { order: true },
    });
  }

  async deleteUser(userId: string) {
    this.invalidateActiveConnectionCache();
    return await this.db.transaction(async (tx) => {
      await tx.delete(connection).where(eq(connection.userId, userId));
      await tx.delete(account).where(eq(account.userId, userId));
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(userSettings).where(eq(userSettings.userId, userId));
      await tx.delete(user).where(eq(user.id, userId));
      await tx.delete(userHotkeys).where(eq(userHotkeys.userId, userId));
    });
  }

  async findUserSettings(userId: string): Promise<typeof userSettings.$inferSelect | undefined> {
    return await this.db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });
  }

  async findUserHotkeys(userId: string): Promise<(typeof userHotkeys.$inferSelect)[]> {
    return await this.db.query.userHotkeys.findMany({
      where: eq(userHotkeys.userId, userId),
    });
  }

  async insertUserHotkeys(userId: string, shortcuts: (typeof userHotkeys.$inferInsert)[]) {
    return await this.db
      .insert(userHotkeys)
      .values({
        userId,
        shortcuts,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userHotkeys.userId,
        set: {
          shortcuts,
          updatedAt: new Date(),
        },
      });
  }

  async insertUserSettings(userId: string, settings: typeof defaultUserSettings) {
    return await this.db.insert(userSettings).values({
      id: crypto.randomUUID(),
      userId,
      settings,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateUserSettings(userId: string, settings: typeof defaultUserSettings) {
    return await this.db
      .insert(userSettings)
      .values({
        id: crypto.randomUUID(),
        userId,
        settings,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          settings,
          updatedAt: new Date(),
        },
      });
  }

  // --- Ask Reta BYOK vault (slice 3A) --------------------------------------
  // The envelope is OPAQUE at this layer: no crypto, no plaintext, and every
  // query is bound to the caller-scoped userId (DbRpcDO). Envelope fields
  // never leave the tRPC layer — listRetaByokCredentialStatus is the only
  // read the routes expose and it carries provider + timestamps only.

  async findRetaByokCredential(
    userId: string,
    provider: string,
  ): Promise<typeof retaByokCredential.$inferSelect | undefined> {
    return await this.db.query.retaByokCredential.findFirst({
      where: and(eq(retaByokCredential.userId, userId), eq(retaByokCredential.provider, provider)),
    });
  }

  /**
   * Status only — NEVER envelope fields (no ciphertext/iv/wrappedDek/...).
   * consentVersion is part of the status: a credential stored under an OLDER
   * consent is NOT usable ("configured" requires the current consent).
   */
  async listRetaByokCredentialStatus(
    userId: string,
  ): Promise<{ provider: string; consentVersion: string; updatedAt: Date }[]> {
    return await this.db.query.retaByokCredential.findMany({
      where: eq(retaByokCredential.userId, userId),
      columns: { provider: true, consentVersion: true, updatedAt: true },
    });
  }

  /**
   * Drizzle binding of the transactional vault core (release-fix 3A):
   * credential row first (FOR UPDATE / DELETE), then settings (FOR UPDATE) —
   * the fixed lock order that serializes select vs delete.
   */
  private vaultTxStore(
    tx: Parameters<Parameters<DB['transaction']>[0]>[0],
    userId: string,
  ): VaultTxStore {
    return {
      lockCredential: async (provider) => {
        const rows = await tx
          .select({
            id: retaByokCredential.id,
            provider: retaByokCredential.provider,
            kekVersion: retaByokCredential.kekVersion,
            consentVersion: retaByokCredential.consentVersion,
          })
          .from(retaByokCredential)
          .where(
            and(eq(retaByokCredential.userId, userId), eq(retaByokCredential.provider, provider)),
          )
          .for('update');
        return rows[0] ?? null;
      },
      deleteCredential: async (provider) => {
        await tx
          .delete(retaByokCredential)
          .where(
            and(eq(retaByokCredential.userId, userId), eq(retaByokCredential.provider, provider)),
          );
      },
      lockSettings: async () => {
        const rows = await tx
          .select({ settings: userSettings.settings })
          .from(userSettings)
          .where(eq(userSettings.userId, userId))
          .for('update');
        return rows[0] ?? null;
      },
      writeSettings: async (settings) => {
        await tx
          .insert(userSettings)
          .values({
            id: crypto.randomUUID(),
            userId,
            settings,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: { settings, updatedAt: new Date() },
          });
      },
    };
  }

  /**
   * Eligibility + selection in ONE transaction (TOCTOU fix): the credential
   * is checked (existence + CURRENT consent + openable KEK version) under a
   * row lock, and the settings write happens in the same transaction — a
   * concurrent delete can never leave an orphan BYOK selection.
   */
  async selectRetaModel(
    userId: string,
    params: SelectRetaModelParams,
  ): Promise<SelectRetaModelResult> {
    return await this.db.transaction(async (tx) =>
      selectRetaModelTx(this.vaultTxStore(tx, userId), params),
    );
  }

  /**
   * CAS persistence of a lazy KEK rewrap: only wrappedDek/wrapIv/kekVersion
   * move (ciphertext + iv are IMMUTABLE here), and only if the row still
   * carries the expected old version — a concurrent rewrap loses the CAS
   * harmlessly (the caller reloads). Returns whether the row was updated.
   */
  async rewrapRetaByokCredential(
    userId: string,
    provider: string,
    params: {
      id: string;
      expectedKekVersion: string;
      wrappedDek: string;
      wrapIv: string;
      kekVersion: string;
    },
  ): Promise<boolean> {
    const updated = await this.db
      .update(retaByokCredential)
      .set({
        wrappedDek: params.wrappedDek,
        wrapIv: params.wrapIv,
        kekVersion: params.kekVersion,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(retaByokCredential.id, params.id),
          eq(retaByokCredential.userId, userId),
          eq(retaByokCredential.provider, provider),
          eq(retaByokCredential.kekVersion, params.expectedKekVersion),
        ),
      )
      .returning({ id: retaByokCredential.id });
    return updated.length > 0;
  }

  /**
   * Set/rotate in ONE transaction: the whole envelope is REPLACED (old row
   * deleted, new row inserted with its fresh id — the AAD is bound to that
   * id, so a half-written mix of old and new envelope cannot exist).
   */
  async replaceRetaByokCredential(
    userId: string,
    data: {
      id: string;
      provider: string;
      ciphertext: string;
      iv: string;
      wrappedDek: string;
      wrapIv: string;
      kekVersion: string;
      consentVersion: string;
    },
  ) {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(retaByokCredential)
        .where(
          and(
            eq(retaByokCredential.userId, userId),
            eq(retaByokCredential.provider, data.provider),
          ),
        );
      await tx.insert(retaByokCredential).values({
        ...data,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
  }

  /**
   * Delete + model reset in ONE transaction, SAME lock order as
   * selectRetaModel (credential row first, then settings): any interleaving
   * with a concurrent selection serializes into either a valid selection
   * later reset by the delete, or a delete observed by the select — never a
   * surviving orphan selection.
   */
  async deleteRetaByokCredentialAndResetModel(
    userId: string,
    provider: string,
    resetModelIds: string[],
    fallbackModelId: string,
  ) {
    await this.db.transaction(async (tx) =>
      deleteRetaCredentialTx(this.vaultTxStore(tx, userId), {
        provider,
        resetModelIds,
        fallbackModelId,
      }),
    );
  }

  async createConnection(
    providerId: EProviders,
    email: string,
    userId: string,
    updatingInfo: {
      expiresAt: Date;
      scope: string;
    },
  ): Promise<{ id: string }[]> {
    this.invalidateActiveConnectionCache();
    return await this.db
      .insert(connection)
      .values({
        ...updatingInfo,
        providerId,
        id: crypto.randomUUID(),
        email,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [connection.email, connection.userId],
        set: {
          ...updatingInfo,
          updatedAt: new Date(),
        },
      })
      .returning({ id: connection.id });
  }

  /**
   * @param connectionId Dangerous, use findUserConnection instead
   * @returns
   */
  async findConnectionById(
    connectionId: string,
  ): Promise<typeof connection.$inferSelect | undefined> {
    return await this.db.query.connection.findFirst({
      where: eq(connection.id, connectionId),
    });
  }

  async syncUserMatrix(connectionId: string, emailStyleMatrix: EmailMatrix) {
    await this.db.transaction(async (tx) => {
      const [existingMatrix] = await tx
        .select({
          numMessages: writingStyleMatrix.numMessages,
          style: writingStyleMatrix.style,
        })
        .from(writingStyleMatrix)
        .where(eq(writingStyleMatrix.connectionId, connectionId));

      if (existingMatrix) {
        const newStyle = createUpdatedMatrixFromNewEmail(
          existingMatrix.numMessages,
          existingMatrix.style as WritingStyleMatrix,
          emailStyleMatrix,
        );

        await tx
          .update(writingStyleMatrix)
          .set({
            numMessages: existingMatrix.numMessages + 1,
            style: newStyle,
          })
          .where(eq(writingStyleMatrix.connectionId, connectionId));
      } else {
        const newStyle = initializeStyleMatrixFromEmail(emailStyleMatrix);

        await tx
          .insert(writingStyleMatrix)
          .values({
            connectionId,
            numMessages: 1,
            style: newStyle,
          })
          .onConflictDoNothing();
      }
    });
  }

  async findWritingStyleMatrix(
    connectionId: string,
  ): Promise<typeof writingStyleMatrix.$inferSelect | undefined> {
    return await this.db.query.writingStyleMatrix.findFirst({
      where: eq(writingStyleMatrix.connectionId, connectionId),
      columns: {
        numMessages: true,
        style: true,
        updatedAt: true,
        connectionId: true,
      },
    });
  }

  async deleteActiveConnection(userId: string, connectionId: string) {
    this.invalidateActiveConnectionCache();
    return await this.db
      .delete(connection)
      .where(and(eq(connection.userId, userId), eq(connection.id, connectionId)));
  }

  async updateConnection(
    connectionId: string,
    updatingInfo: Partial<typeof connection.$inferInsert>,
  ) {
    this.invalidateActiveConnectionCache();
    return await this.db
      .update(connection)
      .set(updatingInfo)
      .where(eq(connection.id, connectionId));
  }

  async findManyEmailTemplates(userId: string): Promise<(typeof emailTemplate.$inferSelect)[]> {
    return await this.db.query.emailTemplate.findMany({
      where: eq(emailTemplate.userId, userId),
      orderBy: desc(emailTemplate.updatedAt),
    });
  }

  async createEmailTemplate(
    userId: string,
    payload: Omit<typeof emailTemplate.$inferInsert, 'userId'>,
  ) {
    return await this.db
      .insert(emailTemplate)
      .values({
        ...payload,
        userId,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
  }

  async deleteEmailTemplate(userId: string, templateId: string) {
    return await this.db
      .delete(emailTemplate)
      .where(and(eq(emailTemplate.id, templateId), eq(emailTemplate.userId, userId)));
  }

  async updateEmailTemplate(
    userId: string,
    templateId: string,
    data: Partial<typeof emailTemplate.$inferInsert>,
  ) {
    return await this.db
      .update(emailTemplate)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(emailTemplate.id, templateId), eq(emailTemplate.userId, userId)))
      .returning();
  }
}

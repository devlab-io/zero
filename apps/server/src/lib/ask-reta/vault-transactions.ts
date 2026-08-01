import { defaultUserSettings, userSettingsSchema } from '../schemas';

/**
 * Ask Reta vault — TRANSACTIONAL core (release-fix 3A, TOCTOU).
 *
 * Model selection and credential deletion used to check eligibility and
 * write settings in SEPARATE statements: a delete interleaved between a
 * select's status check and its settings write could leave an ORPHAN
 * selection (a BYOK model chosen with no credential behind it).
 *
 * These two functions are the whole story now, and both run inside ONE
 * database transaction (ZeroDB wraps them in `db.transaction`). They touch
 * rows in a FIXED order — credential first (SELECT … FOR UPDATE / DELETE),
 * then user settings (SELECT … FOR UPDATE) — so any select/delete
 * interleaving serializes: either the selection lands while the credential
 * exists (and a later delete resets it), or the delete wins and the select
 * observes the missing credential and refuses. Never an orphan selection.
 *
 * The store is a minimal seam so the logic is testable with REAL concurrent
 * interleavings (in-memory row locks) without a Postgres instance.
 */

export type VaultCredentialRow = {
  id: string;
  provider: string;
  kekVersion: string;
  consentVersion: string;
};

export type VaultSettingsRow = { settings: unknown } | null;

export interface VaultTxStore {
  /** SELECT … FOR UPDATE on the (user, provider) credential row. */
  lockCredential(provider: string): Promise<VaultCredentialRow | null>;
  deleteCredential(provider: string): Promise<void>;
  /** SELECT … FOR UPDATE on the user's settings row. */
  lockSettings(): Promise<VaultSettingsRow>;
  writeSettings(settings: typeof defaultUserSettings): Promise<void>;
}

const patchedSettings = (row: VaultSettingsRow, modelId: string): typeof defaultUserSettings => {
  const parsed = userSettingsSchema.safeParse(row?.settings ?? {});
  const base = parsed.success ? parsed.data : defaultUserSettings;
  return { ...base, askRetaModel: modelId };
};

export type SelectRetaModelParams = {
  /** Catalogue id to select — validated against the catalogue by the route. */
  modelId: string;
  /** BYOK provider to check, or null for credential-free (Workers) entries. */
  provider: string | null;
  /** Current consent literal — an older stored consent is NOT eligible. */
  requiredConsentVersion: string;
  /** KEK versions the deployment ring can open — anything else is unusable. */
  supportedKekVersions: string[];
};

export type SelectRetaModelResult = { ok: true } | { ok: false; reason: 'provider-not-configured' };

/** Eligibility + selection in ONE transaction, under the credential row lock. */
export async function selectRetaModelTx(
  store: VaultTxStore,
  params: SelectRetaModelParams,
): Promise<SelectRetaModelResult> {
  if (params.provider) {
    const credential = await store.lockCredential(params.provider);
    if (
      !credential ||
      credential.consentVersion !== params.requiredConsentVersion ||
      !params.supportedKekVersions.includes(credential.kekVersion)
    ) {
      return { ok: false, reason: 'provider-not-configured' };
    }
  }
  const settings = await store.lockSettings();
  await store.writeSettings(patchedSettings(settings, params.modelId));
  return { ok: true };
}

export type DeleteRetaCredentialParams = {
  provider: string;
  /** Server-owned catalogue ids of the provider — selections to reset. */
  resetModelIds: string[];
  fallbackModelId: string;
};

/** Delete + model reset in ONE transaction, same lock order as the select. */
export async function deleteRetaCredentialTx(
  store: VaultTxStore,
  params: DeleteRetaCredentialParams,
): Promise<void> {
  // Lock (or observe absence of) the credential row FIRST — this serializes
  // against a concurrent selectRetaModelTx on the same provider.
  await store.lockCredential(params.provider);
  await store.deleteCredential(params.provider);
  const settings = await store.lockSettings();
  const current = userSettingsSchema.safeParse(settings?.settings ?? {});
  const selected = current.success ? current.data.askRetaModel : undefined;
  if (typeof selected === 'string' && params.resetModelIds.includes(selected)) {
    await store.writeSettings(patchedSettings(settings, params.fallbackModelId));
  }
}

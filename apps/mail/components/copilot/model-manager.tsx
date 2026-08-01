import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTRPC, useTRPCClient } from '@/providers/query-provider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Ask Reta model manager (slice 3B) — lazy chunk, only loaded when opened.
 *
 * SECRET DISCIPLINE (spec docs/spec/mail-copilot.md + P0 secret-cache): the
 * API key exists ONLY as ephemeral state of a card while the dialog is
 * mounted — it is never routed through URL/localStorage/sessionStorage/
 * query cache/analytics/toast/log, never echoed by the server, and cleared
 * on success, error, cancel and unmount (closing the dialog unmounts every
 * card). The writes are IMPERATIVE tRPC-client calls — NEVER TanStack
 * useMutation: mutation `variables` are retained by the MutationCache (and a
 * paused offline mutation could be dehydrated), so the key must never enter
 * them. The payload is built at the LAST instant from local memory state.
 * The ONLY stored facts shown are "configured / not configured" — never a
 * verification status, suffix or length.
 */

const BYOK_PROVIDERS: { provider: string; label: string }[] = [
  { provider: 'openai', label: 'OpenAI' },
  { provider: 'anthropic', label: 'Anthropic' },
  { provider: 'gemini', label: 'Google' },
  { provider: 'moonshot', label: 'Moonshot' },
  { provider: 'zai', label: 'Z.AI' },
];

type CatalogModel = {
  id: string;
  provider: string;
  label: string;
  requiresCredential: boolean;
  configured: boolean;
};

type ModelCatalog = {
  selectedModelId: string;
  vaultAvailable: boolean;
  consentVersion: string;
  models: CatalogModel[];
};

function ProviderCard({
  provider,
  label,
  catalog,
}: {
  provider: string;
  label: string;
  catalog: ModelCatalog;
}) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  // Ephemeral ONLY: card-local state, gone on unmount (dialog close / A→B).
  const [apiKey, setApiKey] = useState('');
  const [consented, setConsented] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const configured = catalog.models.some(
    (model) => model.provider === provider && model.requiresCredential && model.configured,
  );
  const invalidateCatalog = () =>
    queryClient.invalidateQueries({ queryKey: trpc.copilot.modelCatalog.queryKey() });

  const clearForm = () => {
    setApiKey('');
    setConsented(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      // IMPERATIVE call (P0 secret-cache): straight through the tRPC client,
      // NOT useMutation — the key never enters TanStack mutation variables,
      // is never retained by the MutationCache and can never be paused/
      // dehydrated. Payload built at the last instant from local state.
      await trpcClient.copilot.setCredential.mutate({
        provider: provider as never,
        apiKey,
        acceptsMailboxEgress: true,
        consentVersion: catalog.consentVersion as never,
      });
      await invalidateCatalog();
      toast.success(m['common.askReta.keySaved']());
    } catch {
      // Fixed message only — never the transport error, never the key, and
      // NO log of the raw error (the global MutationCache onError is not on
      // this path either).
      toast.error(m['common.askReta.keySaveError']());
    } finally {
      clearForm();
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirmingDelete(false);
    setBusy(true);
    try {
      await trpcClient.copilot.deleteCredential.mutate({ provider: provider as never });
      await invalidateCatalog();
      toast.success(m['common.askReta.keyRemoved']());
    } catch {
      toast.error(m['common.askReta.keyRemoveError']());
    } finally {
      // P0 lifecycle: a replacement key typed BEFORE the delete must not
      // survive a FAILED delete either — the form clears on every outcome.
      clearForm();
      setBusy(false);
    }
  };

  const inputId = `ask-reta-key-${provider}`;
  const consentId = `ask-reta-consent-${provider}`;

  return (
    <div className="rounded-lg border p-3" data-testid={`provider-card-${provider}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <span
          className={
            configured
              ? 'rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground text-xs'
          }
        >
          {configured ? m['common.askReta.configured']() : m['common.askReta.notConfigured']()}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        <label htmlFor={inputId} className="text-muted-foreground block text-xs">
          {m['common.askReta.apiKeyLabel']()}
        </label>
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={m['common.askReta.apiKeyPlaceholder']()}
          value={apiKey}
          disabled={busy}
          onChange={(event) => setApiKey(event.target.value)}
          className="h-8 text-xs"
        />
        <div className="flex items-start gap-2">
          <input
            id={consentId}
            type="checkbox"
            className="mt-0.5"
            checked={consented}
            disabled={busy}
            onChange={(event) => setConsented(event.target.checked)}
          />
          <label htmlFor={consentId} className="text-muted-foreground text-xs">
            {m['common.askReta.consentLabel']()}
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={busy || apiKey.trim().length < 8 || !consented}
            onClick={() => void save()}
          >
            {configured ? m['common.askReta.replaceKey']() : m['common.askReta.saveKey']()}
          </Button>
          {configured &&
            (confirmingDelete ? (
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {m['common.askReta.confirmRemoveKey']()}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {m['common.askReta.confirmRemove']()}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setConfirmingDelete(false)}
                >
                  {m['common.askReta.cancel']()}
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
              >
                {m['common.askReta.removeKey']()}
              </Button>
            ))}
        </div>
      </div>
    </div>
  );
}

export function ModelManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const catalogQuery = useQuery(trpc.copilot.modelCatalog.queryOptions());
  const catalog = catalogQuery.data as ModelCatalog | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] w-[min(34rem,95vw)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m['common.askReta.manageTitle']()}</DialogTitle>
          <DialogDescription>{m['common.askReta.manageSubtitle']()}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Workers AI</p>
              <span className="text-muted-foreground text-xs">
                {m['common.askReta.workersIncluded']()}
              </span>
            </div>
          </div>
          {catalog && !catalog.vaultAvailable ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
              {m['common.askReta.vaultUnavailable']()}
            </p>
          ) : null}
          {catalog?.vaultAvailable
            ? BYOK_PROVIDERS.map(({ provider, label }) => (
                <ProviderCard key={provider} provider={provider} label={label} catalog={catalog} />
              ))
            : null}
          <p className="text-muted-foreground text-xs">{m['common.askReta.privacyNote']()}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Configuration des intégrations d'équipe (P18) — /team?view=integrations,
 * chargé en lazy. OWNER-ONLY pour toute mutation ; un membre voit l'état en
 * lecture. Secrets serveur absents → carte « configuration manquante »
 * explicite, sans rien bloquer d'autre. Aucun secret n'est jamais affiché ni
 * reçu (présence booléenne seule). Light/dark via tokens, responsive,
 * loading/error/disabled/retry, animations sous motion-safe uniquement.
 */
export default function IntegrationSettings({ teamId }: { teamId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reconnectConfirming, setReconnectConfirming] = useState(false);
  const overviewQuery = useQuery(
    trpc.integrations.overview.queryOptions({ teamId }, { staleTime: 15_000, retry: false }),
  );
  const overview = overviewQuery.data;
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.integrations.overview.queryKey({ teamId }) });

  const beginInstall = useMutation(
    trpc.integrations.beginInstall.mutationOptions({
      onSuccess: ({ authorizeUrl }) => {
        // Redirection OAuth (PKCE + state) — le retour passe par
        // /integrations/linear/callback sous session.
        window.location.href = authorizeUrl;
      },
      onError: () => toast.error(m['common.teamIntegrations.missingConfigTitle']()),
    }),
  );
  const revoke = useMutation(
    trpc.integrations.revokeInstall.mutationOptions({ onSuccess: () => void invalidate() }),
  );

  if (overviewQuery.isLoading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <div className="h-24 rounded-2xl bg-black/[0.04] motion-safe:animate-pulse dark:bg-white/[0.06]" />
        <div className="h-40 rounded-2xl bg-black/[0.04] motion-safe:animate-pulse dark:bg-white/[0.06]" />
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="p-4">
        <p role="alert" className="text-muted-foreground text-sm">
          {m['common.teamIntegrations.mappingTargetsUnavailable']()}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => void overviewQuery.refetch()}
        >
          {m['common.teamIntegrations.retry']()}
        </Button>
      </div>
    );
  }

  const configMissing = !overview.vaultConfigured || !overview.oauthConfigured;
  const install = overview.install;
  const active = install?.status === 'active';

  return (
    <div className="space-y-4 p-4">
      {!overview.isOwner && (
        <p className="text-muted-foreground text-xs">{m['common.teamIntegrations.ownerOnly']()}</p>
      )}

      {configMissing && overview.isOwner && (
        <section
          role="alert"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-800 dark:text-amber-300"
        >
          <p className="font-medium">{m['common.teamIntegrations.missingConfigTitle']()}</p>
          <ul className="mt-1 list-disc pl-4">
            {!overview.vaultConfigured && (
              <li>{m['common.teamIntegrations.missingConfigVault']()}</li>
            )}
            {!overview.oauthConfigured && (
              <li>{m['common.teamIntegrations.missingConfigOauth']()}</li>
            )}
          </ul>
          <p className="mt-1">{m['common.teamIntegrations.missingConfigHint']()}</p>
        </section>
      )}

      <section className="rounded-2xl border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">{m['common.teamIntegrations.linearTitle']()}</h3>
            {active ? (
              <p className="text-muted-foreground text-xs">
                {m['common.teamIntegrations.workspace']()} : {install?.workspaceName ?? '—'}
              </p>
            ) : install?.status === 'revoked' ? (
              <p className="text-muted-foreground text-xs">
                {m['common.teamIntegrations.revokedNotice']()}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {m['common.teamIntegrations.notInstalled']()}
              </p>
            )}
          </div>
          {overview.isOwner && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={configMissing || beginInstall.isPending || reconnectConfirming}
                aria-expanded={active ? reconnectConfirming : undefined}
                aria-controls={active ? 'linear-reconnect-confirmation' : undefined}
                onClick={() => {
                  // Relancer sur une connexion ACTIVE exige une confirmation
                  // EXPLICITE (le serveur la re-vérifie aussi).
                  if (active) {
                    setReconnectConfirming(true);
                    return;
                  }
                  beginInstall.mutate({ teamId });
                }}
              >
                {beginInstall.isPending ? (
                  <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
                ) : active ? (
                  m['common.teamIntegrations.reconnect']()
                ) : (
                  m['common.teamIntegrations.connect']()
                )}
              </Button>
              {active && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ teamId })}
                >
                  {m['common.teamIntegrations.disconnect']()}
                </Button>
              )}
            </div>
          )}
        </div>
        {overview.isOwner && active && reconnectConfirming && (
          <div
            id="linear-reconnect-confirmation"
            role="group"
            aria-label={m['common.teamIntegrations.reconnect']()}
            className="bg-muted/40 mt-3 rounded-xl border p-3"
          >
            <p className="text-sm">{m['common.teamIntegrations.reconnectConfirmPrompt']()}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={beginInstall.isPending}
                onClick={() =>
                  beginInstall.mutate(
                    { teamId, reconnectConfirm: true },
                    { onSettled: () => setReconnectConfirming(false) },
                  )
                }
              >
                {beginInstall.isPending ? (
                  <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
                ) : (
                  m['common.teamIntegrations.reconnect']()
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={beginInstall.isPending}
                onClick={() => setReconnectConfirming(false)}
              >
                {m['common.teamRules.cancel']()}
              </Button>
            </div>
          </div>
        )}
      </section>

      {active && overview.isOwner && <MappingsEditor teamId={teamId} overview={overview} />}
      {overview.isOwner && <OutboundWebhooks teamId={teamId} />}
      {overview.isOwner && <ActivityExport teamId={teamId} />}
    </div>
  );
}

type MappingRow = {
  id: string;
  kind: 'team' | 'status' | 'assignee';
  retaValue: string;
  externalId: string;
  externalLabel: string;
};

function MappingsEditor({
  teamId,
  overview,
}: {
  teamId: string;
  overview: { mappings: MappingRow[] };
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const byKind = (kind: 'team' | 'status' | 'assignee') =>
    overview.mappings.filter((mapping) => mapping.kind === kind);
  // Les workflow states dépendent d'une équipe Linear : on lit ceux de la
  // PREMIÈRE équipe mappée (explicite, jamais inférée d'une boîte).
  const firstLinearTeamId = byKind('team')[0]?.externalId;
  const targetsQuery = useQuery(
    trpc.integrations.listLinearTargets.queryOptions(
      { teamId, linearTeamId: firstLinearTeamId },
      { staleTime: 60_000, retry: false },
    ),
  );
  const { data: membersData } = useQuery(
    trpc.teams.listMembers.queryOptions({ teamId }, { staleTime: 60_000, retry: false }),
  );
  const members = (membersData?.members ?? []) as Array<{ userId: string; name: string }>;
  const setMapping = useMutation(
    trpc.integrations.setMapping.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.integrations.overview.queryKey({ teamId }),
        }),
    }),
  );
  const targets = targetsQuery.data;

  return (
    <section className="rounded-2xl border p-3">
      <h3 className="text-sm font-medium">{m['common.teamIntegrations.mappings']()}</h3>
      {targetsQuery.isError && (
        <p role="alert" className="text-muted-foreground mt-1 text-xs">
          {m['common.teamIntegrations.mappingTargetsUnavailable']()}
        </p>
      )}
      <div className="mt-2 space-y-3">
        <MappingGroup
          label={m['common.teamIntegrations.mappingTeams']()}
          rows={byKind('team').map((mapping) => ({
            key: mapping.id,
            retaValue: mapping.retaValue,
            display: mapping.externalLabel || mapping.externalId,
          }))}
          options={(targets?.teams ?? []).map((team) => ({ id: team.id, label: team.name }))}
          pending={setMapping.isPending}
          onAdd={(externalId, label) =>
            setMapping.mutate({
              teamId,
              kind: 'team',
              retaValue: externalId,
              externalId,
              externalLabel: label,
            })
          }
          onRemove={(retaValue) =>
            setMapping.mutate({ teamId, kind: 'team', retaValue, externalId: '' })
          }
        />
        <PairMappingGroup
          label={m['common.teamIntegrations.mappingStatus']()}
          rows={byKind('status').map((mapping) => ({
            key: mapping.id,
            retaValue: mapping.retaValue,
            display: `${mapping.retaValue} → ${mapping.externalLabel || mapping.externalId}`,
          }))}
          retaOptions={[
            { id: 'open', label: 'open' },
            { id: 'closed', label: 'closed' },
          ]}
          externalOptions={(targets?.states ?? []).map((state) => ({
            id: state.id,
            label: state.name,
          }))}
          pending={setMapping.isPending}
          onAdd={(retaValue, externalId, label) =>
            setMapping.mutate({
              teamId,
              kind: 'status',
              retaValue,
              externalId,
              externalLabel: label,
            })
          }
          onRemove={(retaValue) =>
            setMapping.mutate({ teamId, kind: 'status', retaValue, externalId: '' })
          }
        />
        <PairMappingGroup
          label={m['common.teamIntegrations.mappingAssignees']()}
          rows={byKind('assignee').map((mapping) => ({
            key: mapping.id,
            retaValue: mapping.retaValue,
            display: `${members.find((member) => member.userId === mapping.retaValue)?.name ?? mapping.retaValue} → ${mapping.externalLabel || mapping.externalId}`,
          }))}
          retaOptions={members.map((member) => ({ id: member.userId, label: member.name }))}
          externalOptions={(targets?.users ?? []).map((linearUser) => ({
            id: linearUser.id,
            label: linearUser.name || linearUser.email,
          }))}
          pending={setMapping.isPending}
          onAdd={(retaValue, externalId, label) =>
            setMapping.mutate({
              teamId,
              kind: 'assignee',
              retaValue,
              externalId,
              externalLabel: label,
            })
          }
          onRemove={(retaValue) =>
            setMapping.mutate({ teamId, kind: 'assignee', retaValue, externalId: '' })
          }
        />
      </div>
    </section>
  );
}

function PairMappingGroup({
  label,
  rows,
  retaOptions,
  externalOptions,
  pending,
  onAdd,
  onRemove,
}: {
  label: string;
  rows: Array<{ key: string; retaValue: string; display: string }>;
  retaOptions: Array<{ id: string; label: string }>;
  externalOptions: Array<{ id: string; label: string }>;
  pending: boolean;
  onAdd: (retaValue: string, externalId: string, label: string) => void;
  onRemove: (retaValue: string) => void;
}) {
  const [retaValue, setRetaValue] = useState('');
  const [externalId, setExternalId] = useState('');
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <ul className="mt-1 space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{row.display}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              disabled={pending}
              onClick={() => onRemove(row.retaValue)}
            >
              {m['common.teamIntegrations.mappingRemove']()}
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <select
          className="bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          value={retaValue}
          onChange={(event) => setRetaValue(event.target.value)}
          aria-label={`${label} — Reta`}
        >
          <option value="">—</option>
          {retaOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          value={externalId}
          onChange={(event) => setExternalId(event.target.value)}
          aria-label={`${label} — Linear`}
        >
          <option value="">—</option>
          {externalOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={pending || !retaValue || !externalId}
          onClick={() => {
            const option = externalOptions.find((candidate) => candidate.id === externalId);
            onAdd(retaValue, externalId, option?.label ?? '');
            setRetaValue('');
            setExternalId('');
          }}
        >
          {m['common.teamIntegrations.mappingAdd']()}
        </Button>
      </div>
    </div>
  );
}

function MappingGroup({
  label,
  rows,
  options,
  pending,
  onAdd,
  onRemove,
}: {
  label: string;
  rows: Array<{ key: string; retaValue: string; display: string }>;
  options: Array<{ id: string; label: string }>;
  pending: boolean;
  onAdd: (externalId: string, label: string) => void;
  onRemove: (retaValue: string) => void;
}) {
  const [selected, setSelected] = useState('');
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <ul className="mt-1 space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{row.display}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              disabled={pending}
              onClick={() => onRemove(row.retaValue)}
            >
              {m['common.teamIntegrations.mappingRemove']()}
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-2">
        <select
          className="bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          aria-label={label}
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={pending || !selected}
          onClick={() => {
            const option = options.find((candidate) => candidate.id === selected);
            if (option) onAdd(option.id, option.label);
            setSelected('');
          }}
        >
          {m['common.teamIntegrations.mappingAdd']()}
        </Button>
      </div>
    </div>
  );
}

function OutboundWebhooks({ teamId }: { teamId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listQuery = useQuery(
    trpc.integrations.listOutboundWebhooks.queryOptions({ teamId }, { retry: false }),
  );
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.integrations.listOutboundWebhooks.queryKey({ teamId }),
    });
  const create = useMutation(
    trpc.integrations.createOutboundWebhook.mutationOptions({
      onSuccess: () => {
        setUrl('');
        setSecret('');
        void invalidate();
      },
    }),
  );
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>(['thread.status']);
  const webhooks = listQuery.data ?? [];

  return (
    <section className="rounded-2xl border p-3">
      <h3 className="text-sm font-medium">{m['common.teamIntegrations.outboundWebhooks']()}</h3>
      <p className="text-muted-foreground mt-0.5 text-[11px]">
        {m['common.teamIntegrations.webhookNoBody']()}
      </p>
      {webhooks.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {m['common.teamIntegrations.outboundNone']()}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {webhooks.map((hook) => (
            <WebhookRow key={hook.id} hook={hook} teamId={teamId} onChanged={invalidate} />
          ))}
        </ul>
      )}
      <form
        className="mt-2 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!url || secret.length < 16 || events.length === 0) return;
          create.mutate({
            teamId,
            url,
            events: events as Array<'thread.assigned' | 'thread.comment' | 'thread.status'>,
            secret,
          });
        }}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-[11px]">
            <span className="text-muted-foreground">
              {m['common.teamIntegrations.webhookUrl']()}
            </span>
            <Input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              className="mt-0.5 h-8 text-xs"
              required
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted-foreground">
              {m['common.teamIntegrations.webhookSecret']()}
            </span>
            <Input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              minLength={16}
              className="mt-0.5 h-8 text-xs"
              autoComplete="off"
              required
            />
          </label>
        </div>
        <fieldset className="flex flex-wrap items-center gap-3 text-[11px]">
          <legend className="text-muted-foreground">
            {m['common.teamIntegrations.webhookEvents']()}
          </legend>
          {(['thread.assigned', 'thread.comment', 'thread.status'] as const).map((eventType) => (
            <label key={eventType} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={events.includes(eventType)}
                onChange={(changeEvent) =>
                  setEvents((current) =>
                    changeEvent.target.checked
                      ? [...current, eventType]
                      : current.filter((value) => value !== eventType),
                  )
                }
              />
              {eventType}
            </label>
          ))}
        </fieldset>
        {create.isError && (
          <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
            {m['common.teamIntegrations.mappingTargetsUnavailable']()}
          </p>
        )}
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={create.isPending || !url || secret.length < 16 || events.length === 0}
        >
          {create.isPending ? (
            <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
          ) : (
            m['common.teamIntegrations.addWebhook']()
          )}
        </Button>
      </form>
    </section>
  );
}

function WebhookRow({
  hook,
  teamId,
  onChanged,
}: {
  hook: {
    id: string;
    url: string;
    events: string[] | null;
    active: boolean;
    consecutiveFailures: number;
  };
  teamId: string;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const setActive = useMutation(
    trpc.integrations.setOutboundWebhookActive.mutationOptions({ onSuccess: onChanged }),
  );
  const retryDead = useMutation(
    trpc.integrations.retryDeadOutbound.mutationOptions({ onSuccess: onChanged }),
  );
  const deadQuery = useQuery(
    trpc.integrations.listOutboundDeliveries.queryOptions(
      { teamId, webhookId: hook.id, status: 'dead' },
      { staleTime: 30_000, retry: false },
    ),
  );
  const deadCount = deadQuery.data?.length ?? 0;
  return (
    <li className="space-y-0.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate">{hook.url}</span>
        <span className="text-muted-foreground shrink-0">{(hook.events ?? []).join(', ')}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={setActive.isPending}
          onClick={() => setActive.mutate({ teamId, webhookId: hook.id, active: !hook.active })}
        >
          {hook.active
            ? m['common.teamIntegrations.webhookEnabled']()
            : m['common.teamIntegrations.webhookDisabled']()}
        </Button>
      </div>
      {!hook.active && hook.consecutiveFailures > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300" role="status">
          {m['common.teamIntegrations.webhookAutoDisabled']()}
        </p>
      )}
      {deadCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-[11px]">
            {m['common.teamIntegrations.deadDeliveries']({ count: String(deadCount) })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={retryDead.isPending}
            onClick={() => retryDead.mutate({ teamId, webhookId: hook.id })}
          >
            {m['common.teamIntegrations.retryDead']()}
          </Button>
        </div>
      )}
    </li>
  );
}

function ActivityExport({ teamId }: { teamId: string }) {
  const trpc = useTRPC();
  const [exporting, setExporting] = useState(false);
  const client = useQueryClient();

  const exportAll = async () => {
    setExporting(true);
    try {
      const entries: unknown[] = [];
      let cursor: string | null = null;
      // Pagination bornée : 10 pages × 200 = 2000 entrées max par export.
      for (let page = 0; page < 10; page += 1) {
        const result: { entries: unknown[]; nextCursor: string | null } = await client.fetchQuery(
          trpc.integrations.exportActivity.queryOptions({ teamId, cursor, limit: 200 }),
        );
        entries.push(...result.entries);
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      const blob = new Blob([JSON.stringify({ teamId, entries }, null, 2)], {
        type: 'application/json',
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `reta-team-activity-${teamId}.json`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch {
      toast.error(m['common.teamIntegrations.mappingTargetsUnavailable']());
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="rounded-2xl border p-3">
      <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportAll()}>
        {exporting ? (
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        ) : (
          m['common.teamIntegrations.exportActivity']()
        )}
      </Button>
    </section>
  );
}

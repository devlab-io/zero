import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { detectIssueIdentifiers } from '@/lib/linear-issue-draft';
import { useTRPC } from '@/providers/query-provider';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Intégration Linear d'un fil partagé (P18 durci) — section du panneau Team.
 *
 * Flux en DEUX temps : (1) le membre édite titre/note puis demande l'APERÇU —
 * le serveur renvoie le CANONIQUE (titre borné, backlink ACL construit
 * serveur, digest, expiration) ; (2) une zone de confirmation DISTINCTE
 * affiche cet aperçu exact et le bouton de création n'envoie que
 * previewId + clé + digest — jamais un contenu re-forgeable. États couverts :
 * loading / erreur / aperçu expiré / création en cours / réconciliation
 * (issue peut-être créée : relien manuel, aucun rejeu automatique).
 * Clavier natif (boutons/selects), light-dark via tokens, motion-safe.
 */
export function LinearIssuePanel({ teamThreadId }: { teamThreadId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const integrationQuery = useQuery(
    trpc.integrations.threadIntegration.queryOptions(
      { teamThreadId },
      { staleTime: 30_000, retry: false },
    ),
  );
  const data = integrationQuery.data;
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.integrations.threadIntegration.queryKey({ teamThreadId }),
    });

  const [formOpen, setFormOpen] = useState(false);
  // Clé d'idempotence : née à l'OUVERTURE du formulaire, conservée pour le
  // retry — le serveur dédupliquera toute double soumission.
  const [requestKey, setRequestKey] = useState('');
  const subject = data?.subject ?? '';
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [linearTeamId, setLinearTeamId] = useState('');
  const [stateId, setStateId] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [preview, setPreview] = useState<{
    previewId: string;
    title: string;
    description: string;
    digest: string;
  } | null>(null);
  const [notice, setNotice] = useState<null | 'failed' | 'expired' | 'in_flight' | 'reconcile'>(
    null,
  );

  const classifyError = (error: unknown): 'failed' | 'expired' | 'in_flight' | 'reconcile' => {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('preview_expired')) return 'expired';
    if (message.includes('needs_reconciliation')) return 'reconcile';
    if (message.includes('issue_create_in_flight')) return 'in_flight';
    return 'failed';
  };

  const previewIssue = useMutation(
    trpc.integrations.previewIssue.mutationOptions({
      onSuccess: (result) => {
        if (result.status === 'created') {
          // La clé pointait une issue déjà créée : montrer le lien, fermer.
          toast.success(m['common.teamIntegrations.issueCreated']({ id: result.issueIdentifier }));
          setFormOpen(false);
          void invalidate();
          return;
        }
        setPreview({
          previewId: result.previewId,
          title: result.title,
          description: result.description,
          digest: result.digest,
        });
        setNotice(null);
      },
      onError: (error) => setNotice(classifyError(error)),
    }),
  );
  const confirmIssue = useMutation(
    trpc.integrations.confirmIssue.mutationOptions({
      onSuccess: (result) => {
        toast.success(m['common.teamIntegrations.issueCreated']({ id: result.issueIdentifier }));
        setFormOpen(false);
        setPreview(null);
        setNotice(null);
        void invalidate();
      },
      onError: (error) => {
        const kind = classifyError(error);
        setNotice(kind);
        if (kind === 'expired') setPreview(null);
      },
    }),
  );
  const acceptLink = useMutation(
    trpc.integrations.acceptIssueLink.mutationOptions({ onSuccess: () => void invalidate() }),
  );
  const unlink = useMutation(
    trpc.integrations.unlinkIssue.mutationOptions({ onSuccess: () => void invalidate() }),
  );

  if (!data) return null;
  const links = data.issueLinks;
  const linked = new Set(links.map((link) => link.issueIdentifier));
  const suggestions = detectIssueIdentifiers(subject).filter((id) => !linked.has(id));
  const active = data.installStatus === 'active';
  if (!active && links.length === 0) return null;

  const openForm = () => {
    setRequestKey(crypto.randomUUID());
    setTitle(subject);
    setNote('');
    setLinearTeamId(data.allowedTeams[0]?.id ?? '');
    setStateId('');
    setAssigneeUserId('');
    setPreview(null);
    setNotice(null);
    setFormOpen(true);
  };

  const requestPreview = () => {
    if (!linearTeamId) return;
    previewIssue.mutate({
      teamThreadId,
      clientRequestKey: requestKey,
      linearTeamId,
      stateId: stateId || null,
      assigneeUserId: assigneeUserId || null,
      title: title || null,
      note: note || null,
    });
  };

  const noticeText = {
    failed: m['common.teamIntegrations.createFailed'](),
    expired: m['common.teamIntegrations.previewExpired'](),
    in_flight: m['common.teamIntegrations.createInFlight'](),
    reconcile: m['common.teamIntegrations.reconcileNotice'](),
  } as const;

  return (
    <section
      className="mt-3 border-t border-[#E7E7E7] pt-3 dark:border-[#252525]"
      aria-label={m['common.teamIntegrations.linearTitle']()}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
          {m['common.teamIntegrations.linearTitle']()}
        </h4>
        {active && !formOpen && data.allowedTeams.length > 0 && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openForm}>
            {m['common.teamIntegrations.createIssue']()}
          </Button>
        )}
      </div>

      {links.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label={m['common.teamIntegrations.linkedIssues']()}>
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-2 text-xs">
              <a
                href={link.issueUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {link.issueIdentifier || link.issueId}
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={unlink.isPending}
                onClick={() => unlink.mutate({ linkId: link.id })}
              >
                {m['common.teamIntegrations.unlink']()}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {active && suggestions.length > 0 && (
        <div className="mt-2">
          <p className="text-muted-foreground text-[11px]">
            {m['common.teamIntegrations.suggestions']()}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {suggestions.map((identifier) => (
              <li
                key={identifier}
                className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
              >
                <span>{identifier}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[11px]"
                  disabled={acceptLink.isPending}
                  onClick={() => acceptLink.mutate({ teamThreadId, identifier })}
                >
                  {m['common.teamIntegrations.acceptLink']()}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {formOpen && !preview && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            requestPreview();
          }}
        >
          <label className="block text-[11px]">
            <span className="text-muted-foreground">
              {m['common.teamIntegrations.issueTitle']()}
            </span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-0.5 h-8 text-xs"
              maxLength={500}
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted-foreground">
              {m['common.teamIntegrations.issueNote']()}
            </span>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-0.5 min-h-[48px] text-xs"
              maxLength={2000}
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="block text-[11px]">
              <span className="text-muted-foreground">
                {m['common.teamIntegrations.linearTeam']()}
              </span>
              <select
                className="bg-background mt-0.5 h-8 w-full rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                value={linearTeamId}
                onChange={(event) => setLinearTeamId(event.target.value)}
                required
              >
                {data.allowedTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.label || team.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px]">
              <span className="text-muted-foreground">
                {m['common.teamIntegrations.initialStatus']()}
              </span>
              <select
                className="bg-background mt-0.5 h-8 w-full rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                value={stateId}
                onChange={(event) => setStateId(event.target.value)}
              >
                <option value="">{m['common.teamIntegrations.noneOption']()}</option>
                {data.statusMappings.map((mapping) => (
                  <option key={mapping.externalId} value={mapping.externalId}>
                    {mapping.label || mapping.retaStatus}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px]">
              <span className="text-muted-foreground">
                {m['common.teamIntegrations.assignee']()}
              </span>
              <select
                className="bg-background mt-0.5 h-8 w-full rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                value={assigneeUserId}
                onChange={(event) => setAssigneeUserId(event.target.value)}
              >
                <option value="">{m['common.teamIntegrations.noneOption']()}</option>
                {data.assigneeMappings.map((mapping) => (
                  <option key={mapping.userId} value={mapping.userId}>
                    {mapping.label || mapping.userId}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {notice && (
            <p role="alert" className="text-[11px] text-amber-700 dark:text-amber-300">
              {noticeText[notice]}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs"
              disabled={previewIssue.isPending || !linearTeamId}
            >
              {previewIssue.isPending ? (
                <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
              ) : (
                m['common.teamIntegrations.previewButton']()
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFormOpen(false)}
            >
              {m['common.teamRules.cancel']()}
            </Button>
          </div>
        </form>
      )}

      {formOpen && preview && (
        <div
          className="mt-2 space-y-2 rounded-md border border-blue-500/30 bg-blue-500/[0.05] p-2"
          role="region"
          aria-label={m['common.teamIntegrations.confirmZoneTitle']()}
        >
          {/* Zone de CONFIRMATION distincte : l'aperçu CANONIQUE serveur — la
              création n'enverra que previewId + clé + digest. */}
          <p className="text-muted-foreground text-[11px] font-medium">
            {m['common.teamIntegrations.confirmZoneTitle']()}
          </p>
          <p className="text-xs font-medium">{preview.title}</p>
          <pre className="max-h-24 overflow-auto whitespace-pre-wrap font-sans text-[11px]">
            {preview.description}
          </pre>
          {notice && (
            <p role="alert" className="text-[11px] text-amber-700 dark:text-amber-300">
              {noticeText[notice]}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={confirmIssue.isPending || notice === 'reconcile'}
              onClick={() =>
                confirmIssue.mutate({
                  previewId: preview.previewId,
                  clientRequestKey: requestKey,
                  digest: preview.digest,
                })
              }
            >
              {confirmIssue.isPending ? (
                <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
              ) : notice === 'failed' ? (
                m['common.teamIntegrations.retry']()
              ) : (
                m['common.teamIntegrations.confirmCreate']()
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setPreview(null);
                setNotice(null);
              }}
            >
              {m['common.teamIntegrations.backToEdit']()}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

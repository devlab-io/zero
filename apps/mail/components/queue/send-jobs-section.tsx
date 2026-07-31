import {
  VISIBLE_SEND_JOB_STATUSES,
  canRetrySendJobItem,
  formatSendJobRecipients,
  sortSendJobsForDisplay,
  type SendJobListItem,
  type SendJobStatus,
} from '@/components/queue/send-jobs-view-model';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/providers/query-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import { toast } from 'sonner';

// Section « Email sends » de la page Queue : les envois send_job persistants
// (queued/sending/failed), visibles après reload et changement de compte —
// mail.listSendJobs est scoppé utilisateur, pas connexion active. File
// DISTINCTE du draft outbox IA : autre source, autres actions, jamais mélangées.

const sendJobStatusTone: Record<SendJobStatus, string> = {
  queued:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300',
  sending:
    'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300',
  sent: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300',
  cancelled:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
  failed:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
};

const sendJobStatusLabels = (): Record<SendJobStatus, string> => ({
  queued: m['queue.status.queued'](),
  sending: m['queue.status.sending'](),
  sent: m['queue.status.sent'](),
  cancelled: m['queue.status.cancelled'](),
  failed: m['queue.status.failed'](),
});

const formatDate = (value: number | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export function SendJobsSection() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  const sendJobsQuery = useQuery(
    trpc.mail.listSendJobs.queryOptions({ statuses: [...VISIBLE_SEND_JOB_STATUSES] }),
  );

  const items = useMemo(
    () => sortSendJobsForDisplay((sendJobsQuery.data ?? []) as SendJobListItem[]),
    [sendJobsQuery.data],
  );

  const retryMutation = useMutation({
    mutationFn: (input: { messageId: string }) => trpcClient.mail.retrySend.mutate(input),
    onSuccess: async (result) => {
      if (result && 'success' in result && result.success === false) {
        toast.error(m['queue.sendJobs.retryFailed']());
      } else {
        toast.success(m['queue.sendJobs.retried']());
      }
      await queryClient.invalidateQueries({ queryKey: trpc.mail.listSendJobs.queryKey() });
    },
    onError: () => {
      toast.error(m['queue.sendJobs.retryFailed']());
    },
  });

  // Rien d'en cours ni d'échoué : la section s'efface, la page reste au draft
  // outbox IA. (Les erreurs de chargement restent silencieuses ici — la page
  // Queue a déjà son propre état d'erreur pour le réseau.)
  if (!items.length) return null;

  const labels = sendJobStatusLabels();

  return (
    <section className="space-y-2" aria-label={m['queue.sendJobs.title']()}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
          {m['queue.sendJobs.title']()}
        </h2>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {m['queue.sendJobs.description']()}
        </span>
      </div>
      <div className="grid gap-2">
        {items.map((item) => {
          const createdAt = formatDate(item.createdAt);
          const sendAt = formatDate(item.sendAt);
          const recipients = formatSendJobRecipients(item.to);
          return (
            <article
              key={item.id}
              className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn('border', sendJobStatusTone[item.status])}
                    >
                      {labels[item.status]}
                    </Badge>
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      {item.subject || m['queue.item.untitled']()}
                    </h3>
                    <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {m['queue.sendJobs.to']()}:
                      </span>{' '}
                      {recipients || m['queue.sendJobs.noRecipients']()}
                    </p>
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {createdAt ? (
                      <div className="flex min-w-0 items-center gap-1">
                        <dt className="shrink-0 font-medium text-zinc-600 dark:text-zinc-300">
                          {m['queue.item.created']()}:
                        </dt>
                        <dd className="truncate">{createdAt}</dd>
                      </div>
                    ) : null}
                    {sendAt ? (
                      <div className="flex min-w-0 items-center gap-1">
                        <dt className="shrink-0 font-medium text-zinc-600 dark:text-zinc-300">
                          {m['queue.item.scheduled']()}:
                        </dt>
                        <dd className="truncate">{sendAt}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {item.error ? (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                      <span className="font-medium">{m['queue.item.error']()}:</span> {item.error}
                    </p>
                  ) : null}
                </div>
                {canRetrySendJobItem(item.status) ? (
                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => retryMutation.mutate({ messageId: item.id })}
                      disabled={retryMutation.isPending}
                    >
                      <RotateCcw className="h-4 w-4" />
                      {m['queue.actions.retry']()}
                    </Button>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

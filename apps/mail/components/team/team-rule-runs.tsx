import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/**
 * Historique des exécutions de règles (P14) — durable : les runs des règles
 * SUPPRIMÉES restent listés et nommés. L'undo est conditionnel côté serveur :
 * un conflit (le fil a changé depuis le run) ou un échec d'inverse est
 * rapporté honnêtement, sans jamais marquer « annulé » à tort.
 */

type UndoOutcome = { runId: string; status: 'undone' | 'conflicted' | 'failed' };

export function RuleRunsList({ teamId, isOwner }: { teamId: string; isOwner: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const runsQuery = useQuery(
    trpc.teams.listRuleRuns.queryOptions({ teamId }, { staleTime: 15_000 }),
  );
  const [lastUndo, setLastUndo] = useState<UndoOutcome | null>(null);
  const undoRun = useMutation(
    trpc.teams.undoRuleRun.mutationOptions({
      onSuccess: (result, variables) => {
        setLastUndo({ runId: variables.runId, status: result.status });
        void queryClient.invalidateQueries({ queryKey: trpc.teams.listRuleRuns.queryKey() });
        void queryClient.invalidateQueries({ queryKey: trpc.teams.listThreads.queryKey() });
      },
    }),
  );
  const runs = runsQuery.data?.runs ?? [];

  const outcomeLabel = (outcome: string) => {
    switch (outcome) {
      case 'applied':
        return m['common.teamRules.outcomeApplied']();
      case 'processing':
        return m['common.teamRules.outcomeProcessing']();
      case 'skipped':
        return m['common.teamRules.outcomeSkipped']();
      case 'undone':
        return m['common.teamRules.outcomeUndone']();
      default:
        return m['common.teamRules.outcomeError']();
    }
  };

  return (
    <section
      aria-label={m['common.teamRules.historyTitle']()}
      className="mt-3 rounded-lg border border-[#E7E7E7] p-2.5 dark:border-[#252525]"
    >
      <h6 className="text-xs font-medium">{m['common.teamRules.historyTitle']()}</h6>
      {runsQuery.isPending ? (
        <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        </div>
      ) : runs.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">{m['common.teamRules.historyEmpty']()}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {runs.map((run) => (
            <li key={run.id} className="text-xs">
              <div className="flex items-center gap-2">
                <Badge
                  variant={run.outcome === 'applied' ? 'secondary' : 'outline'}
                  className={cn(
                    'shrink-0 text-[9px]',
                    run.outcome === 'error' && 'text-destructive',
                  )}
                >
                  {outcomeLabel(run.outcome)}
                </Badge>
                <span className="min-w-0 truncate font-medium">{run.ruleName}</span>
                <span className="text-muted-foreground min-w-0 truncate">
                  {run.subject || run.threadId}
                </span>
                <time
                  dateTime={new Date(run.createdAt).toISOString()}
                  className="text-muted-foreground shrink-0 tabular-nums"
                >
                  {format(new Date(run.createdAt), 'd MMM HH:mm')}
                </time>
                {isOwner && run.outcome === 'applied' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 text-[10px]"
                    disabled={undoRun.isPending}
                    onClick={() => {
                      setLastUndo(null);
                      undoRun.mutate({ runId: run.id });
                    }}
                  >
                    {m['common.teamRules.undo']()}
                  </Button>
                )}
              </div>
              {run.reason && (
                <p className="text-muted-foreground mt-0.5 pl-1">
                  {m['common.teamRules.reasonLabel']()}: {run.reason}
                </p>
              )}
              {lastUndo?.runId === run.id && lastUndo.status === 'conflicted' && (
                <p
                  role="alert"
                  className="mt-0.5 pl-1 text-[11px] text-amber-700 dark:text-amber-300"
                >
                  {m['common.teamRules.undoConflicted']()}
                </p>
              )}
              {lastUndo?.runId === run.id && lastUndo.status === 'failed' && (
                <p role="alert" className="text-destructive mt-0.5 pl-1 text-[11px]">
                  {m['common.teamRules.undoFailed']()}
                </p>
              )}
              {undoRun.isError && (
                <p role="alert" className="text-destructive mt-0.5 text-[11px]">
                  {m['common.teamRules.undoError']()}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

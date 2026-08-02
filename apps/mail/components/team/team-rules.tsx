import {
  emptyRuleForm,
  ruleFormFromRule,
  type RuleAction,
  type RuleTriggers,
  type TeamRuleView,
} from '@/lib/team-rules-form';
import { RuleForm, type RuleMember, type RuleTeamLabel } from './team-rule-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useTRPC } from '@/providers/query-provider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { RuleRunsList } from './team-rule-runs';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { useState } from 'react';

/**
 * Règles d'équipe (P14) — section de /settings/teams (liste + orchestration ;
 * formulaire et historique dans team-rule-form / team-rule-runs).
 *
 * Une règle surveille la boîte de son CRÉATEUR (owner) et ne peut jamais
 * faire plus que lui : toute action repasse par l'ACL serveur à l'exécution.
 * Mutations réservées aux owners (vérifié serveur). RÉACTIVER une règle qui
 * partage exige une confirmation fraîche nommant l'équipe — comme la
 * création et l'édition ; le serveur refuse sans elle.
 */

export function TeamRulesBlock({
  teamId,
  teamName,
  isOwner,
  members,
}: {
  teamId: string;
  teamName: string;
  isOwner: boolean;
  members: RuleMember[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const rulesQuery = useQuery(trpc.teams.listRules.queryOptions({ teamId }, { staleTime: 30_000 }));
  const labelsQuery = useQuery(
    trpc.teams.listLabels.queryOptions({ teamId }, { staleTime: 60_000 }),
  );
  const rules = (rulesQuery.data?.rules ?? []) as TeamRuleView[];
  const labels = (labelsQuery.data?.labels ?? []) as RuleTeamLabel[];

  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Ré-activation d'une règle share : passe par une confirmation inline. */
  const [pendingEnableId, setPendingEnableId] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.teams.listRules.queryKey({ teamId }) });
    void queryClient.invalidateQueries({ queryKey: trpc.teams.listRuleRuns.queryKey() });
  };
  const setEnabled = useMutation(
    trpc.teams.setRuleEnabled.mutationOptions({
      onSuccess: () => {
        setPendingEnableId(null);
        invalidate();
      },
    }),
  );
  const deleteRule = useMutation(trpc.teams.deleteRule.mutationOptions({ onSuccess: invalidate }));

  const rulesShares = (rule: TeamRuleView) =>
    rule.actions.some((action) => action.kind === 'share');

  return (
    <div className="mt-4 border-t border-[#E7E7E7] pt-3 dark:border-[#252525]">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-muted-foreground text-xs font-medium uppercase">
          {m['common.teamRules.title']()}
        </h5>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            {historyOpen
              ? m['common.teamRules.hideHistory']()
              : m['common.teamRules.showHistory']()}
          </Button>
          {isOwner && editing === null && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setEditing('new')}>
              {m['common.teamRules.newRule']()}
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{m['common.teamRules.description']()}</p>

      {rulesQuery.isPending ? (
        <div className="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        </div>
      ) : rules.length === 0 && editing === null ? (
        <p className="text-muted-foreground mt-3 text-sm">{m['common.teamRules.noRules']()}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="rounded-lg border border-[#E7E7E7] p-2.5 dark:border-[#252525]"
            >
              {editing === rule.id ? (
                <RuleForm
                  teamId={teamId}
                  teamName={teamName}
                  members={members}
                  labels={labels}
                  initial={ruleFormFromRule(rule)}
                  ruleId={rule.id}
                  onDone={() => {
                    setEditing(null);
                    invalidate();
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{rule.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Badge
                        variant={rule.enabled ? 'secondary' : 'outline'}
                        className="text-[10px]"
                      >
                        {rule.enabled
                          ? m['common.teamRules.enabledState']()
                          : m['common.teamRules.disabledState']()}
                      </Badge>
                      {isOwner && (
                        <>
                          <Switch
                            checked={rule.enabled}
                            aria-label={m['common.teamRules.toggleEnabled']()}
                            disabled={setEnabled.isPending}
                            onCheckedChange={(checked) => {
                              if (checked === true && rulesShares(rule)) {
                                // Élargissement ACL : confirmation inline
                                // fraîche exigée (et re-vérifiée serveur).
                                setPendingEnableId(rule.id);
                                return;
                              }
                              setPendingEnableId(null);
                              setEnabled.mutate({ ruleId: rule.id, enabled: checked === true });
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            aria-label={m['common.teamRules.editRule']()}
                            onClick={() => setEditing(rule.id)}
                          >
                            <Pencil className="h-3.5 w-3.5 text-[#9A9A9A]" aria-hidden />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            aria-label={m['common.teamRules.deleteRule']()}
                            disabled={deleteRule.isPending}
                            onClick={() => deleteRule.mutate({ ruleId: rule.id })}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-[#9A9A9A]" aria-hidden />
                          </Button>
                        </>
                      )}
                    </span>
                  </div>
                  {pendingEnableId === rule.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2">
                      <p className="min-w-0 flex-1 text-xs text-amber-800 dark:text-amber-300">
                        {m['common.teamRules.aclEnableConfirm']({ team: teamName })}
                      </p>
                      <Button
                        size="sm"
                        className="h-6 shrink-0 text-[10px]"
                        disabled={setEnabled.isPending}
                        onClick={() =>
                          setEnabled.mutate({
                            ruleId: rule.id,
                            enabled: true,
                            confirmAclExpansion: true,
                          })
                        }
                      >
                        {m['common.teamRules.confirmEnable']()}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 shrink-0 text-[10px]"
                        onClick={() => setPendingEnableId(null)}
                      >
                        {m['common.teamRules.cancel']()}
                      </Button>
                    </div>
                  )}
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {m['common.teamRules.watches']({ email: rule.watchesEmail })} ·{' '}
                    {m['common.teamRules.byCreator']({ name: rule.createdByName })}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {summarizeTriggers(rule.triggers).map((chip) => (
                      <Badge key={chip} variant="outline" className="text-[10px] font-normal">
                        {chip}
                      </Badge>
                    ))}
                    <span className="text-muted-foreground text-[10px]">→</span>
                    {summarizeActions(rule.actions, members, labels).map((chip) => (
                      <Badge key={chip} variant="secondary" className="text-[10px] font-normal">
                        {chip}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing === 'new' && (
        <div className="mt-3 rounded-lg border border-[#E7E7E7] p-2.5 dark:border-[#252525]">
          <RuleForm
            teamId={teamId}
            teamName={teamName}
            members={members}
            labels={labels}
            initial={emptyRuleForm}
            onDone={() => {
              setEditing(null);
              invalidate();
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {historyOpen && <RuleRunsList teamId={teamId} isOwner={isOwner} />}
    </div>
  );
}

function summarizeTriggers(triggers: RuleTriggers): string[] {
  const chips: string[] = [];
  if (triggers.senders)
    chips.push(`${m['common.teamRules.sendersLabel']()}: ${triggers.senders.join(', ')}`);
  if (triggers.domains) chips.push(`@${triggers.domains.join(', @')}`);
  if (triggers.recipients)
    chips.push(`${m['common.teamRules.recipientsLabel']()}: ${triggers.recipients.join(', ')}`);
  if (triggers.keywords) chips.push(`“${triggers.keywords.join('”, “')}”`);
  if (triggers.gmailLabels) chips.push(`Gmail: ${triggers.gmailLabels.join(', ')}`);
  if (triggers.hours) {
    chips.push(`${triggers.hours.from}–${triggers.hours.to} ${triggers.hours.timeZone}`);
  }
  return chips;
}

function summarizeActions(
  actions: RuleAction[],
  members: RuleMember[],
  labels: RuleTeamLabel[],
): string[] {
  const memberName = (id: string) => members.find((member) => member.userId === id)?.name ?? id;
  return actions.map((action) => {
    switch (action.kind) {
      case 'share':
        return m['common.teamRules.actionShare']();
      case 'assign':
        return `${m['common.teamRules.actionAssign']()} ${memberName(action.userId)}`;
      case 'label':
        return `${m['common.teamRules.actionLabelSet']()}: ${action.labelIds
          .map((id) => labels.find((label) => label.id === id)?.name ?? id)
          .join(', ')}`;
      case 'todo':
        return m['common.teamRules.actionTodo']();
      case 'snooze':
        return `${m['common.teamRules.actionSnooze']()} ${m['common.teamRules.snoozeHours']({ count: action.hours })}`;
      case 'notify':
        return `${m['common.teamRules.actionNotify']()} ${action.userIds.map(memberName).join(', ')}`;
    }
  });
}

import {
  buildRuleActions,
  buildRuleTriggers,
  ruleFormReady,
  type RuleFormState,
  type RuleTriggers,
} from '@/lib/team-rules-form';
import { useTRPC } from '@/providers/query-provider';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLocale } from '@/paraglide/runtime';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { useState } from 'react';

/**
 * Formulaire de règle (P14) — création et édition. La confirmation de
 * l'élargissement d'ACL (action share = toute l'équipe) est FRAÎCHE : jamais
 * pré-cochée, exigée à chaque enregistrement, nommant l'équipe — et le
 * serveur la re-vérifie de toute façon.
 */

export type RuleMember = { userId: string; name: string; email: string };
export type RuleTeamLabel = { id: string; name: string };

const WEEKDAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const localWeekdayNames = (): string[] => {
  const formatter = new Intl.DateTimeFormat(getLocale(), { weekday: 'short', timeZone: 'UTC' });
  // 2026-08-02 est un dimanche (UTC) → index 0..6 = dim..sam.
  return Array.from({ length: 7 }, (_, day) =>
    formatter.format(new Date(Date.UTC(2026, 7, 2 + day))),
  );
};

export function RuleForm({
  teamId,
  teamName,
  members,
  labels,
  initial,
  ruleId,
  onDone,
  onCancel,
}: {
  teamId: string;
  teamName: string;
  members: RuleMember[];
  labels: RuleTeamLabel[];
  initial: RuleFormState;
  ruleId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const [form, setForm] = useState<RuleFormState>(initial);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const weekdays = localWeekdayNames();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const set = <K extends keyof RuleFormState>(key: K, value: RuleFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const createRule = useMutation(trpc.teams.createRule.mutationOptions({ onSuccess: onDone }));
  const updateRule = useMutation(trpc.teams.updateRule.mutationOptions({ onSuccess: onDone }));
  // Simulation à la demande (les triggers changent à chaque frappe) — fetch
  // impératif plutôt que useQuery, résultat figé jusqu'au prochain clic.
  const previewQuery = useMutation({
    mutationFn: () => trpcPreview(teamId, buildRuleTriggers(form, timeZone)),
    onSuccess: (rows) => setPreview(rows),
  });
  const saving = createRule.isPending || updateRule.isPending;
  const saveFailed = createRule.isError || updateRule.isError;

  const submit = () => {
    const triggers = buildRuleTriggers(form, timeZone);
    const actions = buildRuleActions(form);
    const confirmAclExpansion = form.share ? form.confirmAclExpansion : undefined;
    if (ruleId) {
      updateRule.mutate({ ruleId, name: form.name.trim(), triggers, actions, confirmAclExpansion });
    } else {
      updateRule.reset();
      createRule.mutate({
        teamId,
        name: form.name.trim(),
        triggers,
        actions,
        confirmAclExpansion,
      });
    }
  };

  const canSubmit = ruleFormReady(form, timeZone);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !saving) submit();
      }}
    >
      <Input
        value={form.name}
        onChange={(event) => set('name', event.target.value)}
        placeholder={m['common.teamRules.ruleName']()}
        aria-label={m['common.teamRules.ruleName']()}
        maxLength={120}
        className="h-8 max-w-sm text-sm"
      />

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">{m['common.teamRules.triggersTitle']()}</legend>
        <p className="text-muted-foreground text-[11px]">{m['common.teamRules.csvHint']()}</p>
        {(
          [
            ['senders', m['common.teamRules.sendersLabel'](), 'a@x.com, b@y.com'],
            ['domains', m['common.teamRules.domainsLabel'](), 'client.pf, partner.com'],
            ['recipients', m['common.teamRules.recipientsLabel'](), 'sales@devlab.io'],
            ['keywords', m['common.teamRules.keywordsLabel'](), 'urgent, facture'],
            ['gmailLabels', m['common.teamRules.gmailLabelsLabel'](), 'INBOX, Clients'],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-56 shrink-0">{label}</span>
            <Input
              value={form[key]}
              onChange={(event) => set(key, event.target.value)}
              placeholder={placeholder}
              className="h-7 max-w-xs flex-1 text-xs"
            />
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex w-56 shrink-0 items-center gap-2">
            <Checkbox
              checked={form.hoursEnabled}
              onCheckedChange={(checked) => set('hoursEnabled', checked === true)}
            />
            {m['common.teamRules.hoursLabel']()}
          </label>
          {form.hoursEnabled && (
            <>
              <Input
                type="time"
                value={form.hoursFrom}
                onChange={(event) => set('hoursFrom', event.target.value)}
                className="h-7 w-24 text-xs"
              />
              <span aria-hidden>–</span>
              <Input
                type="time"
                value={form.hoursTo}
                onChange={(event) => set('hoursTo', event.target.value)}
                className="h-7 w-24 text-xs"
              />
              <span className="text-muted-foreground">{m['common.teamRules.hoursDays']()}</span>
              {weekdays.map((dayName, day) => (
                <label key={WEEKDAY_IDS[day]} className="flex items-center gap-1">
                  <Checkbox
                    checked={form.hoursDays.includes(day)}
                    onCheckedChange={(checked) =>
                      set(
                        'hoursDays',
                        checked === true
                          ? [...form.hoursDays, day]
                          : form.hoursDays.filter((entry) => entry !== day),
                      )
                    }
                  />
                  {dayName}
                </label>
              ))}
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">{m['common.teamRules.actionsTitle']()}</legend>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={form.share}
            onCheckedChange={(checked) => {
              set('share', checked === true);
              // Décocher share invalide la confirmation ; re-cocher la redemande.
              set('confirmAclExpansion', false);
            }}
          />
          {m['common.teamRules.actionShare']()}
        </label>
        {form.share && (
          <div className="ml-6 space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {m['common.teamRules.aclConfirmText']({ team: teamName })}
            </p>
            <label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox
                checked={form.confirmAclExpansion}
                onCheckedChange={(checked) => set('confirmAclExpansion', checked === true)}
              />
              {m['common.teamRules.aclConfirmCheckbox']()}
            </label>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs">
          <span className="w-56 shrink-0">{m['common.teamRules.actionAssign']()}</span>
          <MemberSelect
            members={members}
            value={form.assignUserId}
            onChange={(value) => set('assignUserId', value)}
          />
        </label>
        {labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-56 shrink-0">{m['common.teamRules.actionLabelSet']()}</span>
            {labels.map((label) => (
              <label key={label.id} className="flex items-center gap-1">
                <Checkbox
                  checked={form.labelIds.includes(label.id)}
                  onCheckedChange={(checked) =>
                    set(
                      'labelIds',
                      checked === true
                        ? [...form.labelIds, label.id]
                        : form.labelIds.filter((entry) => entry !== label.id),
                    )
                  }
                />
                {label.name}
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={form.todo}
              onCheckedChange={(checked) => set('todo', checked === true)}
            />
            {m['common.teamRules.actionTodo']()}
          </label>
          {form.todo && (
            <>
              <span className="text-muted-foreground">
                {m['common.teamRules.actionTodoAssignee']()}
              </span>
              <MemberSelect
                members={members}
                value={form.todoAssigneeUserId}
                onChange={(value) => set('todoAssigneeUserId', value)}
              />
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-56 shrink-0">{m['common.teamRules.actionSnooze']()}</span>
          <Input
            type="number"
            min={1}
            max={720}
            value={form.snoozeHours}
            onChange={(event) => set('snoozeHours', event.target.value)}
            className="h-7 w-20 text-xs"
            aria-label={m['common.teamRules.actionSnooze']()}
          />
          <span className="text-muted-foreground">h</span>
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="w-56 shrink-0">{m['common.teamRules.actionNotify']()}</span>
          {members.map((member) => (
            <label key={member.userId} className="flex items-center gap-1">
              <Checkbox
                checked={form.notifyUserIds.includes(member.userId)}
                onCheckedChange={(checked) =>
                  set(
                    'notifyUserIds',
                    checked === true
                      ? [...form.notifyUserIds, member.userId]
                      : form.notifyUserIds.filter((entry) => entry !== member.userId),
                  )
                }
              />
              {member.name}
            </label>
          ))}
        </div>
      </fieldset>

      {saveFailed && (
        <p role="alert" className="text-destructive text-xs">
          {m['common.teamRules.saveError']()}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={!canSubmit || saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {m['common.teamRules.save']()}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={
            Object.keys(buildRuleTriggers(form, timeZone)).length === 0 || previewQuery.isPending
          }
          onClick={() => previewQuery.mutate()}
        >
          {previewQuery.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {m['common.teamRules.simulate']()}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          {m['common.teamRules.cancel']()}
        </Button>
        <span className="text-muted-foreground text-[11px]">
          {m['common.teamRules.simulateHint']()}
        </span>
      </div>

      {previewQuery.isError && (
        <p role="alert" className="text-destructive text-xs">
          {m['common.teamRules.previewError']()}
        </p>
      )}
      {preview !== null && <PreviewTable rows={preview} />}
    </form>
  );
}

function MemberSelect({
  members,
  value,
  onChange,
}: {
  members: RuleMember[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={m['common.teamRules.actionAssign']()}
      className="h-7 rounded-md border border-[#E7E7E7] bg-white px-1.5 text-xs dark:border-[#252525] dark:bg-[#1E1E1E]"
    >
      <option value="">{m['common.teamRules.noAssignee']()}</option>
      {members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {member.name}
        </option>
      ))}
    </select>
  );
}

type PreviewRow = {
  threadId: string;
  subject: string;
  senderEmail: string;
  /** null = fil illisible → « non évalué », jamais présenté comme non-match. */
  verdict: {
    matched: boolean;
    partial: boolean;
    reasons: Array<{ trigger: string; matched: boolean; detail: string; unavailable?: boolean }>;
  } | null;
};

async function trpcPreview(teamId: string, triggers: RuleTriggers): Promise<PreviewRow[]> {
  const { trpcClient } = await import('@/providers/query-provider');
  const result = await trpcClient.teams.previewRule.query({ teamId, triggers });
  return result.rows as PreviewRow[];
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <section
      aria-label={m['common.teamRules.previewTitle']()}
      className="rounded-lg border border-[#E7E7E7] p-2.5 dark:border-[#252525]"
    >
      <h6 className="text-xs font-medium">{m['common.teamRules.previewTitle']()}</h6>
      <p className="text-muted-foreground mt-0.5 text-[11px]">
        {m['common.teamRules.previewNote']()}
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">{m['common.teamRules.previewEmpty']()}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((row) => (
            <li key={row.threadId} className="text-xs">
              <div className="flex items-center gap-2">
                {row.verdict === null ? (
                  <span className="text-muted-foreground shrink-0" aria-hidden>
                    —
                  </span>
                ) : row.verdict.matched ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <X className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                )}
                <span className="min-w-0 truncate font-medium">{row.subject || row.threadId}</span>
                <span className="text-muted-foreground shrink-0">{row.senderEmail}</span>
                <Badge
                  variant={row.verdict?.matched ? 'secondary' : 'outline'}
                  className="shrink-0 text-[9px]"
                >
                  {row.verdict === null
                    ? m['common.teamRules.previewNotEvaluated']()
                    : row.verdict.matched
                      ? m['common.teamRules.previewMatched']()
                      : m['common.teamRules.previewNotMatched']()}
                </Badge>
              </div>
              {row.verdict !== null && (
                <p className="text-muted-foreground mt-0.5 pl-5">
                  {row.verdict.reasons
                    .map((reason) => `${reason.matched ? '✓' : '✗'} ${reason.detail}`)
                    .join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

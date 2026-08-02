/**
 * Règles d'équipe (P14) — modèle PUR du formulaire client : types miroirs du
 * contrat serveur, parsing CSV, construction triggers/actions, hydratation
 * depuis une règle existante. Aucune dépendance React — testé en vitest.
 */

export type RuleTriggers = {
  senders?: string[];
  domains?: string[];
  recipients?: string[];
  keywords?: string[];
  gmailLabels?: string[];
  hours?: { days?: number[]; from: string; to: string; timeZone: string };
};

export type RuleAction =
  | { kind: 'share'; visibility: 'team' }
  | { kind: 'assign'; userId: string }
  | { kind: 'label'; labelIds: string[] }
  | { kind: 'todo'; assigneeUserId?: string }
  | { kind: 'snooze'; hours: number }
  | { kind: 'notify'; userIds: string[] };

export type TeamRuleView = {
  id: string;
  teamId: string;
  name: string;
  enabled: boolean;
  createdByName: string;
  watchesEmail: string;
  triggers: RuleTriggers;
  actions: RuleAction[];
};

export type RuleFormState = {
  name: string;
  senders: string;
  domains: string;
  recipients: string;
  keywords: string;
  gmailLabels: string;
  hoursEnabled: boolean;
  hoursFrom: string;
  hoursTo: string;
  hoursDays: number[];
  share: boolean;
  /** Confirmation FRAÎCHE de l'élargissement ACL — jamais pré-cochée. */
  confirmAclExpansion: boolean;
  assignUserId: string;
  labelIds: string[];
  todo: boolean;
  todoAssigneeUserId: string;
  snoozeHours: string;
  notifyUserIds: string[];
};

export const emptyRuleForm: RuleFormState = {
  name: '',
  senders: '',
  domains: '',
  recipients: '',
  keywords: '',
  gmailLabels: '',
  hoursEnabled: false,
  hoursFrom: '08:00',
  hoursTo: '17:00',
  hoursDays: [],
  share: true,
  confirmAclExpansion: false,
  assignUserId: '',
  labelIds: [],
  todo: false,
  todoAssigneeUserId: '',
  snoozeHours: '',
  notifyUserIds: [],
};

export const parseCsv = (value: string): string[] | undefined => {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
};

export function ruleFormFromRule(rule: TeamRuleView): RuleFormState {
  const find = <K extends RuleAction['kind']>(kind: K) =>
    rule.actions.find((action): action is Extract<RuleAction, { kind: K }> => action.kind === kind);
  return {
    name: rule.name,
    senders: (rule.triggers.senders ?? []).join(', '),
    domains: (rule.triggers.domains ?? []).join(', '),
    recipients: (rule.triggers.recipients ?? []).join(', '),
    keywords: (rule.triggers.keywords ?? []).join(', '),
    gmailLabels: (rule.triggers.gmailLabels ?? []).join(', '),
    hoursEnabled: !!rule.triggers.hours,
    hoursFrom: rule.triggers.hours?.from ?? '08:00',
    hoursTo: rule.triggers.hours?.to ?? '17:00',
    hoursDays: rule.triggers.hours?.days ?? [],
    share: rule.actions.some((action) => action.kind === 'share'),
    // La confirmation ne survit JAMAIS à une édition : elle se redonne.
    confirmAclExpansion: false,
    assignUserId: find('assign')?.userId ?? '',
    labelIds: find('label')?.labelIds ?? [],
    todo: rule.actions.some((action) => action.kind === 'todo'),
    todoAssigneeUserId: find('todo')?.assigneeUserId ?? '',
    snoozeHours: String(find('snooze')?.hours ?? ''),
    notifyUserIds: find('notify')?.userIds ?? [],
  };
}

export function buildRuleTriggers(form: RuleFormState, timeZone: string): RuleTriggers {
  const triggers: RuleTriggers = {};
  const senders = parseCsv(form.senders);
  if (senders) triggers.senders = senders;
  const domains = parseCsv(form.domains);
  if (domains) triggers.domains = domains;
  const recipients = parseCsv(form.recipients);
  if (recipients) triggers.recipients = recipients;
  const keywords = parseCsv(form.keywords);
  if (keywords) triggers.keywords = keywords;
  const gmailLabels = parseCsv(form.gmailLabels);
  if (gmailLabels) triggers.gmailLabels = gmailLabels;
  if (form.hoursEnabled) {
    triggers.hours = {
      from: form.hoursFrom,
      to: form.hoursTo,
      timeZone,
      ...(form.hoursDays.length > 0 ? { days: form.hoursDays } : {}),
    };
  }
  return triggers;
}

export function buildRuleActions(form: RuleFormState): RuleAction[] {
  const actions: RuleAction[] = [];
  if (form.share) actions.push({ kind: 'share', visibility: 'team' });
  if (form.assignUserId) actions.push({ kind: 'assign', userId: form.assignUserId });
  if (form.labelIds.length > 0) actions.push({ kind: 'label', labelIds: form.labelIds });
  if (form.todo) {
    actions.push({
      kind: 'todo',
      ...(form.todoAssigneeUserId ? { assigneeUserId: form.todoAssigneeUserId } : {}),
    });
  }
  const snoozeHours = Number.parseInt(form.snoozeHours, 10);
  if (Number.isInteger(snoozeHours) && snoozeHours > 0) {
    actions.push({ kind: 'snooze', hours: Math.min(snoozeHours, 720) });
  }
  if (form.notifyUserIds.length > 0) actions.push({ kind: 'notify', userIds: form.notifyUserIds });
  return actions;
}

/** Le formulaire est soumissible : nom + ≥1 trigger + ≥1 action + confirmation ACL si share. */
export function ruleFormReady(form: RuleFormState, timeZone: string): boolean {
  if (form.name.trim().length === 0) return false;
  if (Object.keys(buildRuleTriggers(form, timeZone)).length === 0) return false;
  const actions = buildRuleActions(form);
  if (actions.length === 0) return false;
  if (form.share && !form.confirmAclExpansion) return false;
  return true;
}

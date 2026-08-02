import type {
  RuleVerdict,
  TeamRuleAction,
  TeamRuleTriggers,
  TriggerFamily,
  TriggerReason,
} from './team-rules-shared';
import type { IGetThreadResponse } from '../driver/types';

/**
 * Règles d'équipe (P14) — moteur d'évaluation PUR. Aucune I/O : ce module
 * transforme (métadonnées de fil, triggers) en verdict motivé. L'exécution
 * des actions et la persistance vivent dans team-rules-store.ts ; ici tout
 * est testable sans Postgres, sur le modèle de team-onboarding.ts.
 *
 * Sémantique de match : ET entre les familles de triggers présentes, OU à
 * l'intérieur d'une famille. Chaque famille produit une raison explicite
 * (matched + détail) — la même structure sert l'explication d'un run réel et
 * la simulation.
 */

export type {
  RuleVerdict,
  TeamRuleAction,
  TeamRuleTriggers,
  TriggerFamily,
  TriggerReason,
} from './team-rules-shared';

export type RuleThreadMeta = {
  senderEmail: string;
  recipients: string[];
  subject: string;
  /** Corps texte du dernier message, borné — vide si indisponible (preview). */
  bodyText: string;
  /** Ids ET noms des labels Gmail du dernier message. */
  gmailLabels: string[];
  receivedOn: string | null;
};

const MAX_LIST_ENTRIES = 30;
const MAX_KEYWORD_LENGTH = 120;
const MAX_BODY_CHARS = 20_000;
export const MAX_RULE_ACTIONS = 10;

export class TeamRuleValidationError extends Error {
  constructor(public readonly code: 'no_trigger' | 'no_action' | 'invalid_hours') {
    super(code);
    this.name = 'TeamRuleValidationError';
  }
}

const normalizeList = (values: string[] | undefined, lower = true): string[] | undefined => {
  if (!values) return undefined;
  const cleaned = [
    ...new Set(
      values
        .map((value) => (lower ? value.trim().toLowerCase() : value.trim()))
        .filter((value) => value.length > 0)
        .map((value) => value.slice(0, MAX_KEYWORD_LENGTH)),
    ),
  ].slice(0, MAX_LIST_ENTRIES);
  return cleaned.length > 0 ? cleaned : undefined;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Normalise et valide des triggers : listes nettoyées (minuscule, dédup,
 * bornes), au moins UNE famille présente, plage horaire bien formée.
 */
export function normalizeTriggers(input: TeamRuleTriggers): TeamRuleTriggers {
  const normalized: TeamRuleTriggers = {};
  const senders = normalizeList(input.senders);
  if (senders) normalized.senders = senders;
  const domains = normalizeList(input.domains)?.map((domain) => domain.replace(/^@+/, ''));
  if (domains?.length) normalized.domains = domains;
  const recipients = normalizeList(input.recipients);
  if (recipients) normalized.recipients = recipients;
  const keywords = normalizeList(input.keywords);
  if (keywords) normalized.keywords = keywords;
  const gmailLabels = normalizeList(input.gmailLabels, false);
  if (gmailLabels) normalized.gmailLabels = gmailLabels;
  if (input.hours) {
    const { from, to, timeZone } = input.hours;
    if (!TIME_RE.test(from) || !TIME_RE.test(to))
      throw new TeamRuleValidationError('invalid_hours');
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      throw new TeamRuleValidationError('invalid_hours');
    }
    const days = input.hours.days
      ? [
          ...new Set(
            input.hours.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
          ),
        ]
      : undefined;
    normalized.hours = { from, to, timeZone, ...(days && days.length > 0 ? { days } : {}) };
  }
  if (Object.keys(normalized).length === 0) throw new TeamRuleValidationError('no_trigger');
  return normalized;
}

/** Extrait du fil complet les métadonnées nécessaires à l'évaluation. */
export function threadMetaForRules(thread: IGetThreadResponse): RuleThreadMeta | null {
  const latest = thread.latest ?? thread.messages[thread.messages.length - 1];
  if (!latest) return null;
  const recipients = [...latest.to, ...(latest.cc ?? [])]
    .map((entry) => entry?.email?.toLowerCase())
    .filter((email): email is string => !!email);
  const labels = new Set<string>();
  for (const tag of latest.tags ?? []) {
    if (tag.id) labels.add(tag.id);
    if (tag.name) labels.add(tag.name);
  }
  const body = (latest.decodedBody || latest.body || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BODY_CHARS);
  return {
    senderEmail: latest.sender?.email?.toLowerCase() ?? '',
    recipients,
    subject: latest.subject ?? '',
    bodyText: body,
    gmailLabels: [...labels],
    receivedOn: latest.receivedOn ?? null,
  };
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** (jour local, minutes locales) d'un instant dans une zone IANA. */
function localParts(date: Date, timeZone: string): { day: number; minutes: number } | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? NaN);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? NaN);
    const day = WEEKDAY_TO_INDEX[weekday];
    if (day === undefined || Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return { day, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

const toMinutes = (time: string): number => {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
};

function matchHours(
  hours: NonNullable<TeamRuleTriggers['hours']>,
  receivedOn: string | null,
): { matched: boolean; detail: string } {
  if (!receivedOn) return { matched: false, detail: 'received time unknown' };
  const date = new Date(receivedOn);
  if (Number.isNaN(date.getTime())) return { matched: false, detail: 'received time unparsable' };
  const local = localParts(date, hours.timeZone);
  if (!local) return { matched: false, detail: `time zone ${hours.timeZone} unresolvable` };
  if (hours.days && hours.days.length > 0 && !hours.days.includes(local.day)) {
    return { matched: false, detail: `weekday ${local.day} not in [${hours.days.join(', ')}]` };
  }
  const from = toMinutes(hours.from);
  const to = toMinutes(hours.to);
  // from <= to : plage diurne [from, to) ; from > to : plage nocturne (chevauche minuit).
  const inRange =
    from <= to
      ? local.minutes >= from && local.minutes < to
      : local.minutes >= from || local.minutes < to;
  const window = `${hours.from}–${hours.to} ${hours.timeZone}`;
  return {
    matched: inRange,
    detail: inRange ? `received within ${window}` : `received outside ${window}`,
  };
}

/**
 * Évalue un fil contre des triggers normalisés — verdict motivé par famille.
 * `options.unavailable` liste les familles NON évaluables dans ce contexte
 * (ex. preview sur la projection, sans destinataires ni corps) : elles sont
 * marquées honnêtement et exclues du verdict, qui devient `partial`.
 */
export function evaluateRule(
  meta: RuleThreadMeta,
  triggers: TeamRuleTriggers,
  options?: { unavailable?: TriggerFamily[] },
): RuleVerdict {
  const reasons: TriggerReason[] = [];
  const unavailable = new Set(options?.unavailable ?? []);
  const markUnavailable = (trigger: TriggerFamily): boolean => {
    if (!unavailable.has(trigger)) return false;
    reasons.push({
      trigger,
      matched: false,
      unavailable: true,
      detail: 'not evaluable here — checked on live mail at delivery',
    });
    return true;
  };

  if (triggers.senders && !markUnavailable('senders')) {
    const matched = triggers.senders.includes(meta.senderEmail);
    reasons.push({
      trigger: 'senders',
      matched,
      detail: matched
        ? `sender ${meta.senderEmail} is listed`
        : `sender ${meta.senderEmail || '(unknown)'} not in [${triggers.senders.join(', ')}]`,
    });
  }

  if (triggers.domains && !markUnavailable('domains')) {
    const domain = meta.senderEmail.split('@')[1] ?? '';
    const matched = triggers.domains.includes(domain);
    reasons.push({
      trigger: 'domains',
      matched,
      detail: matched
        ? `sender domain ${domain} is listed`
        : `sender domain ${domain || '(unknown)'} not in [${triggers.domains.join(', ')}]`,
    });
  }

  if (triggers.recipients && !markUnavailable('recipients')) {
    const hit = triggers.recipients.find((recipient) => meta.recipients.includes(recipient));
    reasons.push({
      trigger: 'recipients',
      matched: !!hit,
      detail: hit
        ? `recipient ${hit} is present`
        : `none of [${triggers.recipients.join(', ')}] in To/Cc`,
    });
  }

  if (triggers.keywords && !markUnavailable('keywords')) {
    const haystack = `${meta.subject}\n${meta.bodyText}`.toLowerCase();
    const hit = triggers.keywords.find((keyword) => haystack.includes(keyword));
    reasons.push({
      trigger: 'keywords',
      matched: !!hit,
      detail: hit
        ? `keyword “${hit}” found`
        : `none of [${triggers.keywords.join(', ')}] in subject/body`,
    });
  }

  if (triggers.gmailLabels && !markUnavailable('gmailLabels')) {
    const labels = new Set(meta.gmailLabels.map((label) => label.toLowerCase()));
    const hit = triggers.gmailLabels.find((label) => labels.has(label.toLowerCase()));
    reasons.push({
      trigger: 'gmailLabels',
      matched: !!hit,
      detail: hit
        ? `label ${hit} is present`
        : `none of [${triggers.gmailLabels.join(', ')}] on the message`,
    });
  }

  if (triggers.hours && !markUnavailable('hours')) {
    const { matched, detail } = matchHours(triggers.hours, meta.receivedOn);
    reasons.push({ trigger: 'hours', matched, detail });
  }

  const evaluable = reasons.filter((reason) => !reason.unavailable);
  return {
    matched: evaluable.length > 0 && evaluable.every((reason) => reason.matched),
    partial: reasons.some((reason) => reason.unavailable === true),
    reasons,
  };
}

/** Résumé texte d'un verdict — persistée comme `reason` d'un run. */
export function verdictSummary(verdict: RuleVerdict): string {
  return verdict.reasons
    .map((reason) => `${reason.trigger}: ${reason.matched ? '✓' : '✗'} ${reason.detail}`)
    .join(' · ');
}

/**
 * Préflight d'undo : une entrée d'audit postérieure au claim est ÉTRANGÈRE au
 * run — donc bloquante pour l'unshare — sauf si elle porte exactement
 * source='rule' ET le runId de CE run. Une action manuelle (metadata sans
 * provenance, y compris par le créateur de la règle) ou l'écriture d'une
 * AUTRE règle (runId différent) est étrangère.
 */
export function isRunForeignActivity(
  entry: { metadata: Record<string, unknown> },
  runId: string,
): boolean {
  return !(entry.metadata['source'] === 'rule' && entry.metadata['runId'] === runId);
}

/**
 * Une action `share` élargit l'ACL de l'équipe entière à chaque fil qui
 * matche : créer, modifier ou RÉACTIVER une telle règle exige une
 * confirmation explicite et fraîche (confirmAclExpansion), vérifiée côté
 * serveur — l'UI ne fait que la recueillir.
 */
export function requiresAclConfirmation(actions: TeamRuleAction[]): boolean {
  return actions.some((action) => action.kind === 'share');
}

/** Valide la liste d'actions d'une règle (bornes + cohérence minimale). */
export function normalizeActions(actions: TeamRuleAction[]): TeamRuleAction[] {
  if (actions.length === 0 || actions.length > MAX_RULE_ACTIONS) {
    throw new TeamRuleValidationError('no_action');
  }
  // Le share, s'il est présent, s'exécute en premier : les actions d'équipe
  // (assign, label, todo) opèrent sur le team_thread qu'il crée.
  return [...actions].sort((a, b) => (a.kind === 'share' ? -1 : 0) - (b.kind === 'share' ? -1 : 0));
}

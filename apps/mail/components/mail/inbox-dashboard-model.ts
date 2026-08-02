/**
 * P6 — modèle PUR du dashboard : l'état d'une métrique distingue TOUJOURS
 * l'erreur du zéro. Une requête en échec n'affiche JAMAIS un faux 0 — elle
 * devient { kind: 'error' } et l'UI rend « indisponible » + retry.
 */
export type MetricQueryLike = {
  isPending: boolean;
  isError: boolean;
  data: unknown;
};

export type MetricState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; value: string };

export function metricState(query: MetricQueryLike, format: () => string): MetricState {
  if (query.isError) return { kind: 'error' };
  if (query.isPending || query.data === undefined) return { kind: 'loading' };
  return { kind: 'ready', value: format() };
}

export function formatSavedTime(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** « 12 » exact, ou « 12+ » quand le compte est un plancher (page tronquée). */
export function formatFloorCount(count: number, truncated: boolean): string {
  return truncated ? `${count}+` : `${count}`;
}

export type DashboardMetricKey =
  | 'inbox'
  | 'today'
  | 'week'
  | 'drafts'
  | 'timeSaved'
  | 'assigned'
  | 'mentions'
  | 'snoozes';

const DASHBOARD_METRIC_DESTINATIONS: Record<DashboardMetricKey, string> = {
  inbox: '/mail/inbox',
  today: '/mail/sent',
  week: '/mail/sent',
  drafts: '/mail/draft',
  timeSaved: '/mail/sent',
  assigned: '/team?view=assigned',
  mentions: '/team?view=mentions',
  snoozes: '/mail/snoozed',
};

export function dashboardMetricDestination(metric: DashboardMetricKey): string {
  return DASHBOARD_METRIC_DESTINATIONS[metric];
}

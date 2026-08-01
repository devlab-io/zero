import {
  ArrowRight,
  AtSign,
  Bot,
  Clock3,
  FilePenLine,
  Gauge,
  Inbox,
  RotateCcw,
  Send,
  UserCheck,
  Users,
} from 'lucide-react';
import { formatFloorCount, formatSavedTime, metricState } from './inbox-dashboard-model';
import { useMailboxOverview } from '@/hooks/use-mailbox-overview';
import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { Link } from 'react-router';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export { formatSavedTime } from './inbox-dashboard-model';

type InboxDashboardProps = {
  onCompose: () => void;
};

const number = new Intl.NumberFormat();

/**
 * Dashboard Inbox (P6, Impeccable) — plat et sourcé : pas de gradient, pas de
 * héros décoratif, pas de blur. Chaque métrique est un COMPTE réel (mailbox,
 * envois enregistrés, tables d'équipe, snoozes KV) — zéro IA. Une requête en
 * échec affiche « indisponible » + retry, JAMAIS un faux zéro (modèle pur
 * inbox-dashboard-model.ts, testé).
 */
export function InboxDashboard({ onCompose }: InboxDashboardProps) {
  const trpc = useTRPC();
  const overview = useMailboxOverview();
  const assignedQuery = useQuery(
    trpc.teams.myAssignedOpenCount.queryOptions(undefined, { staleTime: 30_000 }),
  );
  const notifQuery = useQuery(
    trpc.teams.unreadNotificationCount.queryOptions(undefined, { staleTime: 30_000 }),
  );
  const snoozeQuery = useQuery(
    trpc.mail.getUpcomingSnoozes.queryOptions(undefined, { staleTime: 60_000 }),
  );
  const activityQuery = useQuery(
    trpc.teams.listNotifications.queryOptions(
      { unreadOnly: false, limit: 5 },
      { staleTime: 30_000 },
    ),
  );

  const metrics = [
    {
      key: 'inbox',
      label: m['common.dashboard.inboxRemaining'](),
      detail: m['common.dashboard.inboxRemainingDetail'](),
      icon: Inbox,
      tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
      state: metricState(overview, () => number.format(overview.data!.folders.inbox)),
      retry: overview.refetch,
    },
    {
      key: 'today',
      label: m['common.dashboard.handledToday'](),
      detail: m['common.dashboard.completedSends'](),
      icon: Send,
      tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      state: metricState(overview, () => number.format(overview.data!.activity.processedToday)),
      retry: overview.refetch,
    },
    {
      key: 'week',
      label: m['common.dashboard.handledWeek'](),
      detail: m['common.dashboard.completedSends'](),
      icon: Gauge,
      tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      state: metricState(overview, () => number.format(overview.data!.activity.processedWeek)),
      retry: overview.refetch,
    },
    {
      key: 'drafts',
      label: m['common.dashboard.draftsWaiting'](),
      detail: m['common.dashboard.readyToFinish'](),
      icon: FilePenLine,
      tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
      state: metricState(overview, () => number.format(overview.data!.folders.drafts)),
      retry: overview.refetch,
    },
    {
      key: 'timeSaved',
      label: m['common.dashboard.timeSaved'](),
      detail: m['common.dashboard.timeSavedDetail'](),
      icon: Clock3,
      tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
      state: metricState(overview, () =>
        formatSavedTime(overview.data!.activity.estimatedMinutesSaved),
      ),
      retry: overview.refetch,
    },
    {
      key: 'assigned',
      label: m['common.dashboard.assignedToYou'](),
      detail: m['common.dashboard.openSharedThreads'](),
      icon: UserCheck,
      tone: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
      state: metricState(assignedQuery, () => number.format(assignedQuery.data!.count)),
      retry: assignedQuery.refetch,
    },
    {
      key: 'mentions',
      label: m['common.dashboard.unreadMentions'](),
      detail: m['common.dashboard.teamNotifications'](),
      icon: AtSign,
      tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
      state: metricState(notifQuery, () => number.format(notifQuery.data!.mentions)),
      retry: notifQuery.refetch,
    },
    {
      key: 'snoozes',
      label: m['common.dashboard.upcomingSnoozes'](),
      detail:
        snoozeQuery.data?.nextWakeAt != null
          ? m['common.dashboard.nextWake']({
              date: format(new Date(snoozeQuery.data.nextWakeAt), 'd MMM HH:mm'),
            })
          : m['common.dashboard.noUpcoming'](),
      icon: Clock3,
      tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
      state: metricState(snoozeQuery, () =>
        formatFloorCount(snoozeQuery.data!.count, snoozeQuery.data!.truncated),
      ),
      retry: snoozeQuery.refetch,
    },
  ];

  const failed = metrics.filter((metric) => metric.state.kind === 'error');
  const loading = metrics.every((metric) => metric.state.kind === 'loading');

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-5 md:p-8" data-testid="inbox-dashboard-loading">
        <div className="mx-auto max-w-4xl space-y-5 motion-safe:animate-pulse">
          <div className="h-16 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
              <div key={item} className="h-28 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5 md:p-8" data-testid="inbox-dashboard">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950 dark:text-white">
            {m['common.dashboard.overview']()}
          </h2>
          <Button onClick={onCompose} className="h-9 gap-2 rounded-lg">
            {m['common.dashboard.newEmail']()}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </header>

        {failed.length > 0 && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-destructive flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm"
          >
            <span>{m['common.dashboard.someUnavailable']()}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => failed.forEach((metric) => void metric.retry())}
            >
              <RotateCcw className="h-3 w-3" />
              {m['common.dashboard.retry']()}
            </Button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {metrics.map((metric) => (
            <article
              key={metric.key}
              className="rounded-2xl border border-black/[0.06] bg-white p-4 md:p-5 dark:border-white/[0.08] dark:bg-white/[0.035]"
            >
              <div
                className={cn(
                  'mb-4 flex h-9 w-9 items-center justify-center rounded-xl',
                  metric.tone,
                )}
              >
                <metric.icon className="h-4 w-4" aria-hidden />
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-[-0.025em] text-zinc-950 dark:text-white">
                {metric.state.kind === 'ready' ? (
                  metric.state.value
                ) : metric.state.kind === 'error' ? (
                  <span className="text-muted-foreground text-base font-medium">
                    {m['common.dashboard.unavailable']()}
                  </span>
                ) : (
                  <span
                    className="inline-block h-7 w-12 rounded bg-black/[0.06] motion-safe:animate-pulse dark:bg-white/[0.08]"
                    aria-hidden
                  />
                )}
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {metric.label}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">{metric.detail}</p>
            </article>
          ))}
        </section>

        <section
          aria-label={m['common.dashboard.recentActivity']()}
          className="rounded-2xl border border-black/[0.06] bg-white p-4 md:p-5 dark:border-white/[0.08] dark:bg-white/[0.035]"
        >
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {m['common.dashboard.recentActivity']()}
          </h3>
          {activityQuery.isError ? (
            <div className="text-muted-foreground flex items-center justify-between text-sm">
              <span>{m['common.dashboard.unavailable']()}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void activityQuery.refetch()}
              >
                <RotateCcw className="h-3 w-3" />
                {m['common.dashboard.retry']()}
              </Button>
            </div>
          ) : activityQuery.isPending ? (
            <div className="space-y-2 motion-safe:animate-pulse" aria-hidden>
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-5 rounded bg-black/[0.04] dark:bg-white/[0.06]" />
              ))}
            </div>
          ) : (activityQuery.data?.notifications.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">
              {m['common.dashboard.noRecentActivity']()}
            </p>
          ) : (
            <ul className="space-y-2">
              {activityQuery.data!.notifications.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{entry.actorName}</span>{' '}
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {activityKindLabel(entry.kind)}
                    </span>
                    {entry.threadSubject ? (
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {' '}
                        — {entry.threadSubject}
                      </span>
                    ) : null}
                  </span>
                  <time
                    className="text-muted-foreground shrink-0 text-xs tabular-nums"
                    dateTime={new Date(entry.createdAt).toISOString()}
                  >
                    {format(new Date(entry.createdAt), 'd MMM HH:mm')}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <DashboardLink
            to="/mail/draft"
            icon={<FilePenLine className="h-4 w-4" />}
            tone="bg-amber-500/10 text-amber-700 dark:text-amber-300"
            title={m['common.dashboard.reviewDrafts']()}
            subtitle={
              overview.data
                ? m['common.dashboard.waiting']({ count: overview.data.folders.drafts })
                : m['common.dashboard.unavailable']()
            }
          />
          <DashboardLink
            to="/mail/draft?view=agent"
            icon={<Bot className="h-4 w-4" />}
            tone="bg-blue-500/10 text-blue-600 dark:text-blue-300"
            title={m['common.dashboard.reviewAgentDrafts']()}
            subtitle={
              overview.data
                ? m['common.dashboard.active']({ count: overview.data.folders.queue })
                : m['common.dashboard.unavailable']()
            }
          />
          <DashboardLink
            to="/team"
            icon={<Users className="h-4 w-4" />}
            tone="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            title={m['common.dashboard.teamThreads']()}
            subtitle={
              assignedQuery.data
                ? m['common.dashboard.waiting']({ count: assignedQuery.data.count })
                : m['common.dashboard.unavailable']()
            }
          />
        </section>

        <p className="px-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
          {m['common.dashboard.footnote']()}
        </p>
      </div>
    </div>
  );
}

function activityKindLabel(kind: string): string {
  switch (kind) {
    case 'mention':
      return m['common.dashboard.activityMention']();
    case 'assignment':
      return m['common.dashboard.activityAssignment']();
    case 'access_granted':
      return m['common.dashboard.activityAccessGranted']();
    case 'access_revoked':
      return m['common.dashboard.activityAccessRevoked']();
    case 'status_changed':
      return m['common.dashboard.activityStatus']();
    default:
      return m['common.dashboard.activityComment']();
  }
}

function DashboardLink({
  to,
  icon,
  tone,
  title,
  subtitle,
}: {
  to: string;
  icon: React.ReactNode;
  tone: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white p-4 transition-colors duration-150 hover:border-blue-500/20 hover:bg-blue-500/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-white/[0.08] dark:bg-white/[0.035] dark:hover:bg-blue-500/[0.08]"
    >
      <div className="flex items-center gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tone)}>
          {icon}
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-zinc-400 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

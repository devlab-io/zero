import { ArrowRight, Clock3, FilePenLine, Gauge, Inbox, Send } from 'lucide-react';
import { useMailboxOverview } from '@/hooks/use-mailbox-overview';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

type InboxDashboardProps = {
  onCompose: () => void;
};

const number = new Intl.NumberFormat();

export function formatSavedTime(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function InboxDashboard({ onCompose }: InboxDashboardProps) {
  const overview = useMailboxOverview();
  const data = overview.data;

  if (!data) {
    return (
      <div className="h-full overflow-y-auto p-5 md:p-8" data-testid="inbox-dashboard-loading">
        <div className="mx-auto max-w-4xl animate-pulse space-y-5">
          <div className="h-36 rounded-3xl bg-black/[0.04] dark:bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-28 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Handled today',
      value: number.format(data.activity.processedToday),
      detail: 'Completed sends',
      icon: Send,
      tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
    },
    {
      label: 'This week',
      value: number.format(data.activity.processedWeek),
      detail: 'Completed sends',
      icon: Gauge,
      tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    {
      label: 'Drafts waiting',
      value: number.format(data.folders.drafts),
      detail: 'Ready to finish',
      icon: FilePenLine,
      tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    },
    {
      label: 'Time saved',
      value: formatSavedTime(data.activity.estimatedMinutesSaved),
      detail: 'Estimated this week',
      icon: Clock3,
      tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-5 md:p-8" data-testid="inbox-dashboard">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <section className="relative overflow-hidden rounded-3xl border border-black/[0.06] bg-gradient-to-br from-blue-500/[0.09] via-white to-violet-500/[0.07] p-6 shadow-sm md:p-7 dark:border-white/[0.08] dark:from-blue-500/[0.14] dark:via-[#1a1a1a] dark:to-violet-500/[0.12]">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
                <span className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]" />
                Inbox overview
              </div>
              <h2 className="text-2xl font-semibold tracking-[-0.025em] text-zinc-950 md:text-3xl dark:text-white">
                {number.format(data.folders.inbox)} messages in your inbox
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Your live mailbox totals and the work completed in Reta, all scoped to this account.
              </p>
            </div>
            <button
              type="button"
              onClick={onCompose}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              New email
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className="rounded-2xl border border-black/[0.06] bg-white/70 p-4 shadow-sm md:p-5 dark:border-white/[0.08] dark:bg-white/[0.035]"
            >
              <div
                className={cn(
                  'mb-4 flex h-9 w-9 items-center justify-center rounded-xl',
                  metric.tone,
                )}
              >
                <metric.icon className="h-4.5 w-4.5" />
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-[-0.025em] text-zinc-950 dark:text-white">
                {metric.value}
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {metric.label}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">{metric.detail}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/mail/draft"
            className="group flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white/70 p-4 shadow-sm transition hover:border-blue-500/20 hover:bg-blue-500/[0.035] dark:border-white/[0.08] dark:bg-white/[0.035] dark:hover:bg-blue-500/[0.08]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <FilePenLine className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Review drafts
                </p>
                <p className="text-xs text-zinc-500">
                  {number.format(data.folders.drafts)} waiting
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            to="/queue"
            className="group flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white/70 p-4 shadow-sm transition hover:border-blue-500/20 hover:bg-blue-500/[0.035] dark:border-white/[0.08] dark:bg-white/[0.035] dark:hover:bg-blue-500/[0.08]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
                <Inbox className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Open queue</p>
                <p className="text-xs text-zinc-500">{number.format(data.folders.queue)} active</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>

        <p className="px-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-600">
          Handled counts are completed sends recorded by Reta. Time saved is an estimate of 2
          minutes per completed message.
        </p>
      </div>
    </div>
  );
}

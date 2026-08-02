import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLocale } from '@/paraglide/runtime';
import { useSession } from '@/lib/auth-client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/**
 * Vue Ops (P16) — chargée en lazy depuis /team?view=ops.
 *
 * Plat et honnête, façon inbox-dashboard : chaque métrique nomme sa source et
 * ses limites (fils visibles par L'UTILISATEUR uniquement, « première
 * réponse » = enregistrée via Reta, bornes affichées quand tronqué), les
 * métriques sans politique SLA sont ABSENTES (jamais un faux zéro), le
 * workload est alphabétique sans score. Aucune animation décorative — un seul
 * pulse de skeleton, motion-safe.
 */

export default function TeamOpsView({ teamId, isOwner }: { teamId: string; isOwner: boolean }) {
  const trpc = useTRPC();
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const overviewQuery = useQuery(
    trpc.teams.opsOverview.queryOptions({ teamId, windowDays }, { staleTime: 30_000 }),
  );

  if (overviewQuery.isPending) {
    return (
      <div className="space-y-3 p-4" aria-hidden data-testid="ops-skeleton">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {['open', 'unassigned', 'shared', 'resolved', 'response', 'resolution'].map((item) => (
            <div
              key={item}
              className="h-24 rounded-2xl bg-black/[0.04] motion-safe:animate-pulse dark:bg-white/[0.06]"
            />
          ))}
        </div>
        <div className="h-40 rounded-2xl bg-black/[0.04] motion-safe:animate-pulse dark:bg-white/[0.06]" />
      </div>
    );
  }

  if (overviewQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16">
        <p className="text-muted-foreground text-sm" role="alert">
          {m['common.teamOps.loadError']()}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => void overviewQuery.refetch()}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {m['common.teamOps.retry']()}
        </Button>
      </div>
    );
  }

  const overview = overviewQuery.data;
  const isEmpty =
    overview.counts.open === 0 &&
    overview.counts.sharedInWindow === 0 &&
    overview.oldestOpenWithoutReply === null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium">{m['common.teamOps.title']()}</h2>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{m['common.teamOps.windowLabel']()}</span>
          <select
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value) as 7 | 30 | 90)}
            className="h-7 rounded-md border border-[#E7E7E7] bg-white px-1.5 text-xs dark:border-[#252525] dark:bg-[#1E1E1E]"
          >
            {[7, 30, 90].map((days) => (
              <option key={days} value={days}>
                {m['common.teamOps.windowDays']({ count: days })}
              </option>
            ))}
          </select>
        </label>
      </header>

      <p className="text-muted-foreground text-[11px] leading-relaxed">
        {m['common.teamOps.basisNote']()}
        {(overview.limits.threadsTruncated || overview.limits.eventsTruncated) && (
          <>
            {' '}
            {m['common.teamOps.truncatedNote']({
              threads: overview.limits.maxThreads,
              events: overview.limits.maxEvents,
            })}
          </>
        )}
      </p>

      {isEmpty ? (
        <p className="text-muted-foreground px-1 py-10 text-center text-sm">
          {m['common.teamOps.empty']()}
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label={m['common.teamOps.open']()} value={overview.counts.open} />
            <StatCard label={m['common.teamOps.unassigned']()} value={overview.counts.unassigned} />
            <StatCard
              label={m['common.teamOps.sharedWindow']()}
              value={overview.counts.sharedInWindow}
            />
            <StatCard
              label={m['common.teamOps.resolvedWindow']()}
              value={overview.counts.resolvedInWindow}
            />
            {overview.overdue.firstResponse !== null && (
              <StatCard
                label={m['common.teamOps.overdueFirstResponse']()}
                value={overview.overdue.firstResponse}
                alert={overview.overdue.firstResponse > 0}
              />
            )}
            {overview.overdue.resolution !== null && (
              <StatCard
                label={m['common.teamOps.overdueResolution']()}
                value={overview.overdue.resolution}
                alert={overview.overdue.resolution > 0}
              />
            )}
          </section>
          {overview.sla === null && (
            <p className="text-muted-foreground text-xs">{m['common.teamOps.noSla']()}</p>
          )}

          <section className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
            <h3 className="text-sm font-medium">{m['common.teamOps.oldestTitle']()}</h3>
            {overview.oldestOpenWithoutReply ? (
              <p className="mt-1 text-sm">
                <span className="font-medium">
                  {overview.oldestOpenWithoutReply.subject || '—'}
                </span>{' '}
                <span className="text-muted-foreground text-xs">
                  {m['common.teamOps.sharedOn']({
                    date: format(new Date(overview.oldestOpenWithoutReply.sharedAt), 'd MMM HH:mm'),
                  })}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">
                {m['common.teamOps.oldestNone']()}
              </p>
            )}
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <DurationCard
              title={m['common.teamOps.statsFirstResponse']()}
              stats={overview.firstResponse}
            />
            <DurationCard
              title={m['common.teamOps.statsResolution']()}
              stats={overview.resolution}
            />
          </section>

          <section className="grid grid-cols-2 gap-3">
            <StatCard label={m['common.teamOps.reopenings']()} value={overview.reopenings} />
            <StatCard label={m['common.teamOps.transfers']()} value={overview.transfers} />
          </section>

          <section className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
            <h3 className="text-sm font-medium">{m['common.teamOps.labelVolumesTitle']()}</h3>
            <p className="text-muted-foreground text-[11px]">
              {m['common.teamOps.labelVolumesNote']()}
            </p>
            {overview.labelVolumes.length === 0 ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {m['common.teamOps.labelVolumesEmpty']()}
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {overview.labelVolumes.map((entry) => (
                  <li
                    key={entry.labelId}
                    className="flex items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{entry.name}</span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {entry.shared} {m['common.teamOps.labelShared']()} · {entry.resolved}{' '}
                      {m['common.teamOps.labelResolved']()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
            <h3 className="text-sm font-medium">{m['common.teamOps.workloadTitle']()}</h3>
            <p className="text-muted-foreground text-[11px]">
              {m['common.teamOps.workloadNote']()}
            </p>
            <ul className="mt-2 space-y-1">
              {overview.workload.map((row) => (
                <li key={row.userId} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="tabular-nums">{row.openAssigned}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
            <h3 className="text-sm font-medium">{m['common.teamOps.stuckTitle']()}</h3>
            {overview.stuckProcessing.length === 0 ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {m['common.teamOps.stuckNone']()}
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {overview.stuckProcessing.map((run) => (
                  <li key={run.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{run.ruleName}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {m['common.teamOps.minutesShort']({ count: run.ageMinutes })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <CoverageSection teamId={teamId} isOwner={isOwner} overview={overview} />
      <PolicySection teamId={teamId} isOwner={isOwner} policy={overview.sla} />
    </div>
  );
}

function StatCard({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums tracking-[-0.02em]',
          alert && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">{label}</p>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return m['common.teamOps.minutesShort']({ count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

function DurationCard({
  title,
  stats,
}: {
  title: string;
  stats: { medianMinutes: number | null; p90Minutes: number | null; sampleSize: number };
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
      <h3 className="text-sm font-medium">{title}</h3>
      {stats.sampleSize === 0 ? (
        <p className="text-muted-foreground mt-1 text-sm">{m['common.teamOps.noSample']()}</p>
      ) : (
        <div className="mt-2 flex items-baseline gap-4">
          <div>
            <p className="text-xl font-semibold tabular-nums">
              {formatMinutes(stats.medianMinutes ?? 0)}
            </p>
            <p className="text-muted-foreground text-[11px]">{m['common.teamOps.median']()}</p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums">
              {formatMinutes(stats.p90Minutes ?? 0)}
            </p>
            <p className="text-muted-foreground text-[11px]">{m['common.teamOps.p90']()}</p>
          </div>
          <p className="text-muted-foreground ml-auto text-[11px]">
            {m['common.teamOps.sampleSize']({ count: stats.sampleSize })}
          </p>
        </div>
      )}
    </div>
  );
}

type Overview = {
  coverage: {
    availableCount: number;
    totalCount: number;
    rows: Array<{ userId: string; name: string; absentUntil: string | null }>;
  };
};

function CoverageSection({
  teamId,
  isOwner,
  overview,
}: {
  teamId: string;
  isOwner: boolean;
  overview: Overview;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const myUserId = session?.user?.id ?? '';
  const absencesQuery = useQuery(
    trpc.teams.listAbsences.queryOptions({ teamId }, { staleTime: 30_000 }),
  );
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.teams.listAbsences.queryKey({ teamId }) });
    void queryClient.invalidateQueries({ queryKey: trpc.teams.opsOverview.queryKey() });
  };
  const declare = useMutation(trpc.teams.declareAbsence.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.teams.removeAbsence.mutationOptions({ onSuccess: invalidate }));

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const absences = absencesQuery.data?.absences ?? [];

  return (
    <section className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{m['common.teamOps.coverageTitle']()}</h3>
        <span className="text-muted-foreground text-xs tabular-nums">
          {m['common.teamOps.availableCount']({
            available: overview.coverage.availableCount,
            total: overview.coverage.totalCount,
          })}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {overview.coverage.rows.map((row) => (
          <li key={row.userId} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{row.name}</span>
            {row.absentUntil ? (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {m['common.teamOps.absentUntil']({
                  date: format(new Date(row.absentUntil), 'd MMM'),
                })}
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>

      <h4 className="text-muted-foreground mt-4 text-xs font-medium uppercase">
        {m['common.teamOps.absencesTitle']()}
      </h4>
      {absences.length > 0 && (
        <ul className="mt-1 space-y-1">
          {absences.map((absence) => (
            <li key={absence.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">
                {absence.userName} · {format(new Date(absence.startsAt), 'd MMM')} →{' '}
                {format(new Date(absence.endsAt), 'd MMM')}
                {absence.note ? ` · ${absence.note}` : ''}
              </span>
              {(isOwner || absence.userId === myUserId) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 text-[10px]"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ absenceId: absence.id })}
                >
                  {m['common.teamOps.absenceRemove']()}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-2 flex flex-wrap items-center gap-2 text-xs"
        onSubmit={(event) => {
          event.preventDefault();
          if (!from || !to) return;
          declare.mutate(
            {
              teamId,
              targetUserId: isOwner && targetUserId ? targetUserId : myUserId,
              startsAt: new Date(`${from}T00:00:00`).toISOString(),
              endsAt: new Date(`${to}T23:59:59`).toISOString(),
              note: note.trim() || undefined,
            },
            { onSuccess: () => (setFrom(''), setTo(''), setNote('')) },
          );
        }}
      >
        <span className="text-muted-foreground w-full md:w-auto">
          {m['common.teamOps.declareAbsence']()}
        </span>
        {isOwner && (
          <select
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
            aria-label={m['common.teamOps.absenceMember']()}
            className="h-7 rounded-md border border-[#E7E7E7] bg-white px-1.5 dark:border-[#252525] dark:bg-[#1E1E1E]"
          >
            <option value="">{m['common.teamOps.absenceMember']()}</option>
            {overview.coverage.rows.map((row) => (
              <option key={row.userId} value={row.userId}>
                {row.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1">
          {m['common.teamOps.absenceFrom']()}
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-7 w-36 text-xs"
          />
        </label>
        <label className="flex items-center gap-1">
          {m['common.teamOps.absenceTo']()}
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-7 w-36 text-xs"
          />
        </label>
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={m['common.teamOps.absenceNote']()}
          maxLength={300}
          className="h-7 w-40 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          className="h-7 text-xs"
          disabled={declare.isPending || !from || !to}
        >
          {declare.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {m['common.teamOps.absenceAdd']()}
        </Button>
        {declare.isError && (
          <span role="alert" className="text-destructive">
            {m['common.teamOps.absenceError']()}
          </span>
        )}
      </form>
    </section>
  );
}

type Policy = {
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  timeZone: string;
  businessHours: { days: number[]; start: string; end: string };
} | null;

const localWeekdayNames = (): string[] => {
  const formatter = new Intl.DateTimeFormat(getLocale(), { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, day) =>
    formatter.format(new Date(Date.UTC(2026, 7, 2 + day))),
  );
};
const WEEKDAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function PolicySection({
  teamId,
  isOwner,
  policy,
}: {
  teamId: string;
  isOwner: boolean;
  policy: Policy;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const weekdays = localWeekdayNames();
  const [firstResponse, setFirstResponse] = useState(
    policy?.firstResponseMinutes != null ? String(policy.firstResponseMinutes) : '',
  );
  const [resolution, setResolution] = useState(
    policy?.resolutionMinutes != null ? String(policy.resolutionMinutes) : '',
  );
  const [timeZone, setTimeZone] = useState(
    policy?.timeZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
  );
  const [start, setStart] = useState(policy?.businessHours.start ?? '08:00');
  const [end, setEnd] = useState(policy?.businessHours.end ?? '17:00');
  const [days, setDays] = useState<number[]>(policy?.businessHours.days ?? [1, 2, 3, 4, 5]);

  const save = useMutation(
    trpc.teams.setSlaPolicy.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.teams.opsOverview.queryKey() });
        void queryClient.invalidateQueries({ queryKey: trpc.teams.getSlaPolicy.queryKey() });
      },
    }),
  );

  return (
    <section className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
      <h3 className="text-sm font-medium">{m['common.teamOps.policyTitle']()}</h3>
      {!isOwner ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {m['common.teamOps.policyOwnerOnly']()}
        </p>
      ) : (
        <form
          className="mt-2 space-y-2 text-xs"
          onSubmit={(event) => {
            event.preventDefault();
            const parse = (value: string) => {
              const parsed = Number.parseInt(value, 10);
              return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
            };
            if (days.length === 0) return;
            save.mutate({
              teamId,
              firstResponseMinutes: parse(firstResponse),
              resolutionMinutes: parse(resolution),
              timeZone,
              businessHours: { days, start, end },
            });
          }}
        >
          <p className="text-muted-foreground">{m['common.teamOps.policyNoTarget']()}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1">
              {m['common.teamOps.policyFirstResponse']()}
              <Input
                type="number"
                min={5}
                value={firstResponse}
                onChange={(event) => setFirstResponse(event.target.value)}
                className="h-7 w-24 text-xs"
              />
            </label>
            <label className="flex items-center gap-1">
              {m['common.teamOps.policyResolution']()}
              <Input
                type="number"
                min={5}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                className="h-7 w-24 text-xs"
              />
            </label>
            <label className="flex items-center gap-1">
              {m['common.teamOps.policyTimezone']()}
              <Input
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                className="h-7 w-44 text-xs"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{m['common.teamOps.policyHours']()}</span>
            <Input
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="h-7 w-24 text-xs"
            />
            <span aria-hidden>–</span>
            <Input
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="h-7 w-24 text-xs"
            />
            <span className="text-muted-foreground">{m['common.teamOps.policyDays']()}</span>
            {weekdays.map((dayName, day) => (
              <label key={WEEKDAY_IDS[day]} className="flex items-center gap-1">
                <Checkbox
                  checked={days.includes(day)}
                  onCheckedChange={(checked) =>
                    setDays(
                      checked === true ? [...days, day] : days.filter((entry) => entry !== day),
                    )
                  }
                />
                {dayName}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs"
              disabled={save.isPending || days.length === 0}
            >
              {save.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : null}
              {m['common.teamOps.policySave']()}
            </Button>
            {save.isError && (
              <span role="alert" className="text-destructive">
                {m['common.teamOps.policyError']()}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

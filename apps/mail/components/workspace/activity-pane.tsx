import { Activity, ArrowUpRight, RefreshCcw, Users } from 'lucide-react';
import { useMyTeams, useTeamNotifications } from '@/hooks/use-teams';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { m } from '@/paraglide/messages';
import { Link } from 'react-router';

function actionLabel(action: string) {
  switch (action) {
    case 'assignment':
      return m['globalWorkspace.activity.actions.assigned']();
    case 'status_changed':
      return m['globalWorkspace.activity.actions.status']();
    case 'comment':
      return m['globalWorkspace.activity.actions.commented']();
    case 'mention':
      return m['globalWorkspace.activity.actions.mentioned']();
    case 'access_granted':
      return m['globalWorkspace.activity.actions.granted']();
    case 'access_revoked':
      return m['globalWorkspace.activity.actions.revoked']();
    default:
      return m['globalWorkspace.activity.actions.updated']();
  }
}

export function ActivityPane() {
  const teamsQuery = useMyTeams();
  const team = teamsQuery.data?.teams[0] ?? null;
  const activityQuery = useTeamNotifications({ unreadOnly: false, limit: 80 });

  if (teamsQuery.isPending) return <ActivitySkeleton />;
  if (!team) {
    return (
      <EmptyActivity
        icon={Users}
        title={m['globalWorkspace.activity.noTeam']()}
        description={m['globalWorkspace.activity.noTeamDescription']()}
      />
    );
  }
  if (activityQuery.isError) {
    return (
      <EmptyActivity
        icon={RefreshCcw}
        title={m['globalWorkspace.activity.unavailable']()}
        action={m['globalWorkspace.retry']()}
        onAction={() => void activityQuery.refetch()}
      />
    );
  }

  const entries = activityQuery.data?.notifications ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{m['globalWorkspace.activity.title']()}</p>
          <p className="text-muted-foreground truncate text-xs">{team.name}</p>
        </div>
        <Button asChild variant="ghost" size="icon" className="size-9">
          <Link to="/team" aria-label={m['globalWorkspace.activity.openTeam']()}>
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </div>
      {activityQuery.isPending ? (
        <ActivitySkeleton />
      ) : entries.length === 0 ? (
        <EmptyActivity
          icon={Activity}
          title={m['globalWorkspace.activity.empty']()}
          description={m['globalWorkspace.activity.emptyDescription']()}
        />
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="hover:bg-muted/60 group flex gap-3 rounded-lg px-2 py-2.5"
            >
              <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase">
                {entry.actorName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  <span className="font-medium">{entry.actorName}</span>{' '}
                  <span className="text-muted-foreground">{actionLabel(entry.kind)}</span>
                </p>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground truncate text-[11px]">
                    {entry.threadSubject ?? entry.teamName}
                  </span>
                  <time
                    className="text-muted-foreground shrink-0 text-[11px] tabular-nums"
                    dateTime={new Date(entry.createdAt).toISOString()}
                  >
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EmptyActivity({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="bg-muted mb-4 flex size-11 items-center justify-center rounded-full">
        <Icon className="text-muted-foreground size-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-muted-foreground mt-1 max-w-xs text-xs">{description}</p>}
      {action && onAction && (
        <Button size="sm" className="mt-4" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4 p-4 motion-safe:animate-pulse">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <div className="bg-muted size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="bg-muted h-3 w-4/5 rounded" />
            <div className="bg-muted h-2 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

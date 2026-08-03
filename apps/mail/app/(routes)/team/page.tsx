import {
  useMarkTeamNotificationsRead,
  useMyTeams,
  useTeamNotifications,
  useTeamThreads,
} from '@/hooks/use-teams';
import { resolveTeamWorkspaceView, selectMentionNotifications } from '@/lib/team-workspace-view';
import { ArrowLeft, AtSign, Gauge, Loader2, Plug, UserCheck, Users } from 'lucide-react';
import { SharedThreadViewer } from '@/components/team/shared-thread-viewer';
import { CollabOnboardingCard } from '@/components/team/collab-onboarding';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { lazy, Suspense, useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useConnections } from '@/hooks/use-connections';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// P16 : la vue Ops (agrégats + SLA + disponibilité) reste hors du bundle de
// la page tant que l'onglet n'est pas ouvert.
const TeamOpsView = lazy(() => import('@/components/team/team-ops-view'));
const IntegrationSettings = lazy(() => import('@/components/team/integration-settings'));

/**
 * Espace « Fils d'équipe » : tous les fils partagés des équipes de
 * l'utilisateur, filtres statut/assignation. Deux chemins de lecture :
 *  - « Ouvrir dans ma boîte » quand une de MES connexions porte la boîte du
 *    partageur (mêmes threadIds) ;
 *  - sinon le lecteur partagé cross-account via le proxy ACL backend.
 */

type StatusFilter = 'open' | 'closed' | 'all';
type AssigneeFilter = 'all' | 'me' | 'unassigned';

export default function TeamWorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolveTeamWorkspaceView(searchParams.get('view'));
  const { data: teamsData, isLoading: teamsLoading } = useMyTeams();
  const teams = teamsData?.teams ?? [];
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  // P18 : ?thread=<teamThreadId> — backlink ACL depuis une issue Linear ; le
  // lecteur partagé revérifie l'accès côté serveur à l'ouverture.
  const [viewerThreadId, setViewerThreadId] = useState<string | null>(
    () => searchParams.get('thread') || null,
  );
  const requestedTeamId = searchParams.get('team');
  const selectedTeamId =
    (requestedTeamId && teams.some((team) => team.id === requestedTeamId)
      ? requestedTeamId
      : null) ??
    teams[0]?.id ??
    null;

  const { data: threadsData, isLoading: threadsLoading } = useTeamThreads(selectedTeamId, {
    status: statusFilter === 'all' ? undefined : statusFilter,
    assignee: view === 'assigned' ? 'me' : assigneeFilter === 'all' ? undefined : assigneeFilter,
  });
  const threads = threadsData?.threads ?? [];
  const notificationsQuery = useTeamNotifications({ unreadOnly: false, limit: 100 });
  const markNotificationsRead = useMarkTeamNotificationsRead();
  const mentions = selectMentionNotifications(notificationsQuery.data?.notifications ?? []);

  const { data: connectionsData } = useConnections();
  const myMailboxes = useMemo(() => {
    const list =
      connectionsData && 'connections' in connectionsData ? connectionsData.connections : [];
    return new Set(list.map((connection) => connection.email.toLowerCase()));
  }, [connectionsData]);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-[#E7E7E7] px-4 py-3 dark:border-[#252525]">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label={m['common.actions.back']()}
            onClick={() => navigate('/mail/inbox')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="flex items-center gap-2 text-base font-medium">
            <Users className="h-4 w-4" /> {m['common.teams.workspaceTitle']()}
          </h1>
        </div>
        {teams.length > 1 && (
          <select
            value={selectedTeamId ?? ''}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              next.set('team', event.target.value);
              setSearchParams(next, { replace: true });
            }}
            aria-label={m['common.teams.selectTeam']()}
            className="h-8 rounded-md border border-[#E7E7E7] bg-white px-2 text-sm dark:border-[#252525] dark:bg-[#1E1E1E]"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}
      </header>

      <nav
        aria-label={m['common.teams.workspaceViews']()}
        className="flex items-center gap-1 border-b border-[#E7E7E7] px-4 py-2 dark:border-[#252525]"
      >
        {(
          [
            ['shared', m['common.teams.workspaceViewShared'](), Users],
            ['assigned', m['common.teams.workspaceViewAssigned'](), UserCheck],
            ['mentions', m['common.teams.workspaceViewMentions'](), AtSign],
            ['ops', m['common.teamOps.tab'](), Gauge],
            ['integrations', m['common.teamIntegrations.tab'](), Plug],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-current={view === value ? 'page' : undefined}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set('view', value);
              setSearchParams(next, { replace: true });
            }}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
              view === value
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {view !== 'mentions' && view !== 'ops' && view !== 'integrations' && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E7E7E7] px-4 py-2 dark:border-[#252525]">
          {(
            [
              ['open', m['common.teams.filterOpen']()],
              ['closed', m['common.teams.filterDone']()],
              ['all', m['common.teams.filterAll']()],
            ] as const
          ).map(([value, label]) => (
            <FilterChip
              key={value}
              active={statusFilter === value}
              label={label}
              onClick={() => setStatusFilter(value)}
            />
          ))}
          {view === 'shared' && (
            <span className="mx-1 h-4 w-px bg-[#E7E7E7] dark:bg-[#252525]" aria-hidden />
          )}
          {view === 'shared' &&
            (
              [
                ['all', m['common.teams.filterAll']()],
                ['me', m['common.teams.filterMine']()],
                ['unassigned', m['common.teams.filterUnassigned']()],
              ] as const
            ).map(([value, label]) => (
              <FilterChip
                key={value}
                active={assigneeFilter === value}
                label={label}
                onClick={() => setAssigneeFilter(value)}
              />
            ))}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {teams.length > 0 && view !== 'ops' && view !== 'integrations' && (
          <div className="px-4 pt-3">
            <CollabOnboardingCard context="team" />
          </div>
        )}
        {view === 'integrations' && selectedTeamId ? (
          <Suspense
            fallback={
              <div className="space-y-3 p-4" aria-hidden>
                <div className="h-24 rounded-2xl bg-black/[0.04] motion-safe:animate-pulse dark:bg-white/[0.06]" />
              </div>
            }
          >
            <IntegrationSettings key={selectedTeamId} teamId={selectedTeamId} />
          </Suspense>
        ) : view === 'ops' && selectedTeamId ? (
          <Suspense
            fallback={
              <div className="space-y-3 p-4" aria-hidden>
                <div className="h-24 rounded-2xl bg-black/[0.04] motion-safe:animate-pulse dark:bg-white/[0.06]" />
                <div className="h-40 rounded-2xl bg-black/[0.04] motion-safe:animate-pulse dark:bg-white/[0.06]" />
              </div>
            }
          >
            <TeamOpsView
              key={selectedTeamId}
              teamId={selectedTeamId}
              // P17 : team.manage = owner OU admin (matrice serveur).
              isOwner={['owner', 'admin'].includes(
                teams.find((team) => team.id === selectedTeamId)?.role ?? '',
              )}
            />
          </Suspense>
        ) : teamsLoading ||
          (view === 'mentions' ? notificationsQuery.isLoading : threadsLoading) ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-muted-foreground px-4 py-16 text-center text-sm">
            {m['common.teams.noTeamsHint']()}{' '}
            <Link to="/settings/teams" className="underline">
              {m['common.teams.manageTeams']()}
            </Link>
          </div>
        ) : view === 'mentions' && mentions.length === 0 ? (
          <p className="text-muted-foreground px-4 py-16 text-center text-sm">
            {m['common.teams.noMentions']()}
          </p>
        ) : view === 'mentions' ? (
          <ul className="divide-y divide-[#E7E7E7] dark:divide-[#252525]">
            {mentions.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none"
                  onClick={() => {
                    setViewerThreadId(notification.teamThreadId!);
                    if (!notification.readAt) {
                      markNotificationsRead.mutate({ ids: [notification.id] });
                    }
                  }}
                >
                  <AtSign className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {notification.threadSubject || m['common.teams.untitledThread']()}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {notification.actorName} · {notification.teamName} ·{' '}
                      {format(new Date(notification.createdAt), 'd MMM HH:mm')}
                    </span>
                  </span>
                  {!notification.readAt && (
                    <span
                      className="mt-1 size-2 rounded-full bg-blue-500"
                      aria-label={m['common.teams.unread']()}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : threads.length === 0 ? (
          <p className="text-muted-foreground px-4 py-16 text-center text-sm">
            {m['common.teams.noSharedThreads']()}
          </p>
        ) : (
          <ul className="divide-y divide-[#E7E7E7] dark:divide-[#252525]">
            {threads.map((thread) => {
              const inMyMailbox = myMailboxes.has(thread.sharerEmail.toLowerCase());
              return (
                <li key={thread.id}>
                  <div
                    className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none dark:hover:bg-white/5 dark:focus-visible:bg-white/5"
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewerThreadId(thread.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setViewerThreadId(thread.id);
                      }
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'truncate text-sm',
                            thread.status === 'open' ? 'font-medium' : 'text-muted-foreground',
                          )}
                        >
                          {thread.subject || '—'}
                        </span>
                        {thread.status === 'closed' && (
                          <Badge variant="outline" className="shrink-0 text-[9px]">
                            {m['common.teams.done']()}
                          </Badge>
                        )}
                        {thread.visibility === 'restricted' && (
                          <Badge variant="outline" className="shrink-0 text-[9px]">
                            {m['common.teams.restricted']()}
                          </Badge>
                        )}
                        {(thread.labels ?? []).map((label) => (
                          <Badge key={label.id} variant="secondary" className="shrink-0 text-[9px]">
                            {label.name}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {thread.preview}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        {m['common.teams.sharedBy']({ name: thread.sharerName })} ·{' '}
                        {m['common.teams.commentCount']({ count: thread.commentCount })} ·{' '}
                        {format(new Date(thread.lastActivityAt), 'd MMM HH:mm')}
                      </p>
                    </div>
                    {inMyMailbox && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/mail/inbox?threadId=${thread.threadId}`);
                        }}
                      >
                        {m['common.teams.openInMailbox']()}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      <SharedThreadViewer
        teamThreadId={viewerThreadId}
        open={viewerThreadId !== null}
        onOpenChange={(open) => {
          if (!open) setViewerThreadId(null);
        }}
      />
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        active
          ? 'bg-black text-white dark:bg-white dark:text-black'
          : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-white/10',
      )}
    >
      {label}
    </button>
  );
}

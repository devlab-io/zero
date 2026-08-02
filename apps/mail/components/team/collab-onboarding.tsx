import {
  collabSnapshotStorageKey,
  completedStepCount,
  decideCollabAnalytics,
  firstOpenStep,
  parseCollabSnapshot,
  COLLAB_STEP_ORDER,
  type CollabOnboardingStatus,
  type CollabStepKey,
} from '@/lib/collab-onboarding';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, HelpCircle, Loader2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTRPC } from '@/providers/query-provider';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { useMyTeams } from '@/hooks/use-teams';
import { Input } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * Checklist d'onboarding collaboration (P13) — chaque étape est un FAIT réel
 * dérivé côté serveur (équipe, invitation acceptée, partage, commentaire,
 * assignation menée à Done), jamais cochée à la main, jamais de démo ni de
 * confetti. Le masquage est persistant par (équipe, membre) côté serveur ;
 * l'aide contextuelle de chaque étape se rouvre à volonté.
 */

const INTRO_DISMISS_KEY_PREFIX = 'collab-onboarding:v1:intro-dismissed:';

type StepCopy = { label: string; help: string };

function stepCopy(key: CollabStepKey): StepCopy {
  switch (key) {
    case 'team_created':
      return {
        label: m['common.collabOnboarding.stepTeamCreated'](),
        help: m['common.collabOnboarding.stepTeamCreatedHelp'](),
      };
    case 'invite_accepted':
      return {
        label: m['common.collabOnboarding.stepInviteAccepted'](),
        help: m['common.collabOnboarding.stepInviteAcceptedHelp'](),
      };
    case 'first_share':
      return {
        label: m['common.collabOnboarding.stepFirstShare'](),
        help: m['common.collabOnboarding.stepFirstShareHelp'](),
      };
    case 'first_comment':
      return {
        label: m['common.collabOnboarding.stepFirstComment'](),
        help: m['common.collabOnboarding.stepFirstCommentHelp'](),
      };
    case 'first_assignment_done':
      return {
        label: m['common.collabOnboarding.stepFirstAssignmentDone'](),
        help: m['common.collabOnboarding.stepFirstAssignmentDoneHelp'](),
      };
  }
}

export function CollabOnboardingCard({ context }: { context: 'dashboard' | 'team' }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const { data: teamsData, isLoading: teamsLoading } = useMyTeams();
  const teams = teamsData?.teams ?? [];
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const teamId = selectedTeamId ?? teams[0]?.id ?? null;

  const statusQuery = useQuery(
    trpc.teams.onboardingStatus.queryOptions(
      { teamId: teamId ?? '' },
      {
        enabled: !!teamId,
        staleTime: 15_000,
        refetchInterval: (query) =>
          query.state.data && query.state.data.loopCompletedAt === null ? 30_000 : false,
      },
    ),
  );
  const status = statusQuery.data ?? null;

  // Analytics minimales : les faits sont horodatés côté serveur. `$insert_id`
  // les déduplique aussi entre appareils ; le cache local évite le travail de
  // re-capture courant. Sans clé PostHog, aucun état « fired » n'est écrit.
  useEffect(() => {
    if (
      !status ||
      !userId ||
      typeof localStorage === 'undefined' ||
      !import.meta.env.VITE_PUBLIC_POSTHOG_KEY
    )
      return;
    const key = collabSnapshotStorageKey(userId, status.teamId);
    const previous = parseCollabSnapshot(localStorage.getItem(key));
    const decision = decideCollabAnalytics(previous, status);
    if (decision.events.length === 0) return;
    void import('posthog-js')
      .then(({ default: posthog }) => {
        for (const event of decision.events) posthog.capture(event.name, event.properties);
        localStorage.setItem(key, JSON.stringify(decision.snapshot));
      })
      .catch(() => {
        // L'observation n'est pas marquée comme émise : une prochaine visite
        // retentera, avec le même $insert_id idempotent.
      });
  }, [status, userId]);

  const setDismissed = useMutation(
    trpc.teams.setOnboardingDismissed.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.teams.onboardingStatus.queryKey(),
        });
      },
    }),
  );

  const [introDismissed, setIntroDismissed] = useState(true);
  useEffect(() => {
    if (typeof localStorage === 'undefined' || !userId) return;
    setIntroDismissed(localStorage.getItem(INTRO_DISMISS_KEY_PREFIX + userId) === 'true');
  }, [userId]);
  const dismissIntro = useCallback(() => {
    if (typeof localStorage !== 'undefined' && userId) {
      localStorage.setItem(INTRO_DISMISS_KEY_PREFIX + userId, 'true');
    }
    setIntroDismissed(true);
  }, [userId]);

  if (teamsLoading || (!!teamId && statusQuery.isPending)) {
    return (
      <section
        aria-busy="true"
        aria-label={m['common.collabOnboarding.loading']()}
        className="rounded-2xl border border-black/[0.06] bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.035]"
      >
        <div className="h-4 w-48 animate-pulse rounded bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-700" />
        <div className="mt-4 h-20 animate-pulse rounded-lg bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-800" />
      </section>
    );
  }

  if (statusQuery.isError) {
    return (
      <section
        role="alert"
        className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-white p-4 text-sm dark:border-red-900 dark:bg-white/[0.035]"
      >
        <span>{m['common.collabOnboarding.loadError']()}</span>
        <Button variant="outline" size="sm" onClick={() => void statusQuery.refetch()}>
          {m['common.collabOnboarding.retry']()}
        </Button>
      </section>
    );
  }

  if (teams.length === 0) {
    // Pas encore d'équipe : la première étape est la création réelle.
    if (context === 'team') return null; // la page /team a déjà son état vide dédié
    if (introDismissed) return null;
    return (
      <CardShell onDismiss={dismissIntro}>
        <StepList status={null} openStep="team_created" teamId={null} inviteSent={false} />
      </CardShell>
    );
  }

  if (!status) return null;

  const complete = status.loopCompletedAt !== null;
  const dismissed = status.dismissedAt !== null;

  if (dismissed) {
    if (context !== 'team') return null;
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        disabled={setDismissed.isPending}
        onClick={() => teamId && setDismissed.mutate({ teamId, dismissed: false })}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
        {m['common.collabOnboarding.reopen']()}
      </Button>
    );
  }

  if (complete && context === 'dashboard') return null;

  return (
    <CardShell
      onDismiss={teamId ? () => setDismissed.mutate({ teamId, dismissed: true }) : undefined}
      dismissPending={setDismissed.isPending}
      headerExtra={
        teams.length > 1 ? (
          <select
            value={teamId ?? ''}
            onChange={(event) => setSelectedTeamId(event.target.value)}
            aria-label={m['common.teams.selectTeam']()}
            className="h-7 rounded-md border border-black/[0.08] bg-white px-1.5 text-xs dark:border-white/[0.1] dark:bg-[#1E1E1E]"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        ) : null
      }
      progress={m['common.collabOnboarding.progress']({
        done: completedStepCount(status),
        total: COLLAB_STEP_ORDER.length,
      })}
    >
      {complete ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {m['common.collabOnboarding.loopDone']()}
        </p>
      ) : (
        <StepList
          status={status}
          openStep={firstOpenStep(status)}
          teamId={teamId}
          inviteSent={status.inviteSent}
        />
      )}
    </CardShell>
  );
}

function CardShell({
  children,
  onDismiss,
  dismissPending,
  headerExtra,
  progress,
}: {
  children: React.ReactNode;
  onDismiss?: () => void;
  dismissPending?: boolean;
  headerExtra?: React.ReactNode;
  progress?: string;
}) {
  return (
    <section
      aria-label={m['common.collabOnboarding.title']()}
      data-testid="collab-onboarding"
      className="rounded-2xl border border-black/[0.06] bg-white p-4 md:p-5 dark:border-white/[0.08] dark:bg-white/[0.035]"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            aria-hidden
          >
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {m['common.collabOnboarding.title']()}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
              {m['common.collabOnboarding.subtitle']()}
              {progress ? <span className="tabular-nums"> · {progress}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerExtra}
          {onDismiss ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={m['common.collabOnboarding.dismiss']()}
              disabled={dismissPending}
              onClick={onDismiss}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function StepList({
  status,
  openStep,
  teamId,
  inviteSent,
}: {
  status: CollabOnboardingStatus | null;
  openStep: CollabStepKey | null;
  teamId: string | null;
  inviteSent: boolean;
}) {
  const [helpOpenFor, setHelpOpenFor] = useState<CollabStepKey | null>(null);

  return (
    <ol className="space-y-1">
      {COLLAB_STEP_ORDER.map((key, index) => {
        const copy = stepCopy(key);
        const done = status?.steps[key].done ?? false;
        const isCurrent = key === openStep;
        const helpOpen = helpOpenFor === key;
        return (
          <li key={key} className="rounded-lg px-2 py-1.5">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums',
                  done
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : isCurrent
                      ? 'bg-blue-500/15 font-medium text-blue-700 dark:text-blue-300'
                      : 'bg-black/[0.05] text-zinc-500 dark:bg-white/[0.08]',
                )}
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 text-sm',
                  done
                    ? 'text-zinc-500 line-through decoration-zinc-400/60 dark:text-zinc-500'
                    : isCurrent
                      ? 'font-medium text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-600 dark:text-zinc-400',
                )}
              >
                {copy.label}
                {done && status?.steps[key].at ? (
                  <span className="sr-only"> — {status.steps[key].at}</span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                aria-expanded={helpOpen}
                aria-label={
                  helpOpen
                    ? m['common.collabOnboarding.hideHelp']()
                    : m['common.collabOnboarding.showHelp']()
                }
                onClick={() => setHelpOpenFor(helpOpen ? null : key)}
              >
                <HelpCircle
                  className={cn('h-3.5 w-3.5', helpOpen ? 'text-blue-600 dark:text-blue-300' : '')}
                  aria-hidden
                />
              </Button>
            </div>
            {helpOpen ? (
              <p className="mt-1 pl-8 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {copy.help}
              </p>
            ) : null}
            {isCurrent ? (
              <div className="mt-2 pl-8">
                <StepAction step={key} teamId={teamId} inviteSent={inviteSent} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepAction({
  step,
  teamId,
  inviteSent,
}: {
  step: CollabStepKey;
  teamId: string | null;
  inviteSent: boolean;
}) {
  switch (step) {
    case 'team_created':
      return <CreateTeamAction />;
    case 'invite_accepted':
      return <InviteAction teamId={teamId} inviteSent={inviteSent} />;
    case 'first_share':
      return (
        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
          <Link to="/mail/inbox">{m['common.collabOnboarding.openInbox']()}</Link>
        </Button>
      );
    case 'first_comment':
    case 'first_assignment_done':
      return (
        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
          <Link to={teamId ? `/team?team=${encodeURIComponent(teamId)}` : '/team'}>
            {m['common.collabOnboarding.openTeamThreads']()}
          </Link>
        </Button>
      );
  }
}

function CreateTeamAction() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const createTeam = useMutation(
    trpc.teams.create.mutationOptions({
      onSuccess: () => {
        setName('');
        void queryClient.invalidateQueries({ queryKey: trpc.teams.list.queryKey() });
        void queryClient.invalidateQueries({
          queryKey: trpc.teams.onboardingStatus.queryKey(),
        });
      },
    }),
  );
  return (
    <form
      className="flex max-w-md items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (trimmed.length > 0) createTeam.mutate({ name: trimmed });
      }}
    >
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={m['common.teams.teamNamePlaceholder']()}
        aria-label={m['common.teams.teamNamePlaceholder']()}
        maxLength={80}
        className="h-8 text-sm"
      />
      <Button
        type="submit"
        size="sm"
        className="h-8 shrink-0 text-xs"
        disabled={createTeam.isPending || name.trim().length === 0}
      >
        {createTeam.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}
        {m['common.teams.createTeam']()}
      </Button>
      {createTeam.isError ? (
        <span role="alert" className="text-destructive text-xs">
          {m['common.collabOnboarding.createError']()}
        </span>
      ) : null}
    </form>
  );
}

function InviteAction({ teamId, inviteSent }: { teamId: string | null; inviteSent: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const invite = useMutation(
    trpc.teams.invite.mutationOptions({
      onSuccess: () => {
        setEmail('');
        void queryClient.invalidateQueries({
          queryKey: trpc.teams.onboardingStatus.queryKey(),
        });
        void queryClient.invalidateQueries({ queryKey: trpc.teams.listInvites.queryKey() });
      },
    }),
  );
  return (
    <div className="max-w-md space-y-1.5">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = email.trim();
          if (teamId && trimmed.length > 0) invite.mutate({ teamId, email: trimmed });
        }}
      >
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={m['common.teams.invitePlaceholder']()}
          aria-label={m['common.teams.invitePlaceholder']()}
          maxLength={320}
          className="h-8 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={invite.isPending || email.trim().length === 0 || !teamId}
        >
          {invite.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {m['common.teams.invite']()}
        </Button>
      </form>
      {invite.isError ? (
        <p role="alert" className="text-destructive text-xs">
          {m['common.collabOnboarding.inviteSendError']()}
        </p>
      ) : null}
      {inviteSent && !invite.isError ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {m['common.collabOnboarding.inviteWaiting']()}
        </p>
      ) : null}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsCard } from '@/components/settings/settings-card';
import { TeamRulesBlock } from '@/components/team/team-rules';
import { useMyInvites, useMyTeams } from '@/hooks/use-teams';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import { useTRPC } from '@/providers/query-provider';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { useState } from 'react';

/**
 * Réglages Équipes : créer, inviter (l'invitation est liée à une adresse
 * email et résolue à l'acceptation contre l'email de session), membres,
 * préférences de notification par équipe, quitter/supprimer.
 */
export default function TeamsSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: teamsData, isLoading } = useMyTeams();
  const teams = teamsData?.teams ?? [];
  const [name, setName] = useState('');

  const invalidateTeams = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.teams.list.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.teams.myInvites.queryKey() });
  };
  const createTeam = useMutation(
    trpc.teams.create.mutationOptions({
      onSuccess: () => {
        setName('');
        invalidateTeams();
      },
    }),
  );

  return (
    <div className="grid gap-6">
      <SettingsCard
        title={m['common.teams.settingsTitle']()}
        description={m['common.teams.settingsDescription']()}
      >
        <ScrollArea className="h-[calc(100dvh-14rem)]">
          <div className="space-y-6 pr-3">
            <MyInvitesBlock onChanged={invalidateTeams} />

            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = name.trim();
                if (trimmed) createTeam.mutate({ name: trimmed });
              }}
            >
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={m['common.teams.teamNamePlaceholder']()}
                aria-label={m['common.teams.createTeam']()}
                maxLength={80}
                className="max-w-xs"
              />
              <Button type="submit" size="sm" disabled={!name.trim() || createTeam.isPending}>
                {createTeam.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  m['common.teams.create']()
                )}
              </Button>
            </form>

            {isLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              teams.map((team) => (
                <TeamBlock key={team.id} team={team} onChanged={invalidateTeams} />
              ))
            )}
          </div>
        </ScrollArea>
      </SettingsCard>
    </div>
  );
}

function MyInvitesBlock({ onChanged }: { onChanged: () => void }) {
  const trpc = useTRPC();
  const { data } = useMyInvites();
  const invites = data?.invites ?? [];
  const accept = useMutation(trpc.teams.acceptInvite.mutationOptions({ onSuccess: onChanged }));
  const decline = useMutation(trpc.teams.declineInvite.mutationOptions({ onSuccess: onChanged }));
  if (invites.length === 0) return null;
  return (
    <section
      aria-label={m['common.teams.myInvites']()}
      className="rounded-lg border border-[#E7E7E7] p-3 dark:border-[#252525]"
    >
      <h4 className="mb-2 text-sm font-medium">{m['common.teams.myInvites']()}</h4>
      <ul className="space-y-2">
        {invites.map((invite) => (
          <li key={invite.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{invite.teamName}</span>{' '}
              <span className="text-muted-foreground text-xs">
                {m['common.teams.invitedBy']({ name: invite.invitedByName })}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={accept.isPending}
                onClick={() => accept.mutate({ inviteId: invite.id })}
              >
                <Check className="h-3 w-3" /> {m['common.teams.accept']()}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={decline.isPending}
                onClick={() => decline.mutate({ inviteId: invite.id })}
              >
                <X className="h-3 w-3" /> {m['common.teams.decline']()}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamBlock({
  team,
  onChanged,
}: {
  team: {
    id: string;
    name: string;
    role: 'owner' | 'member';
    memberCount: number;
    prefs: { onComment: boolean; onMention: boolean; onAssignment: boolean } | null;
  };
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const myUserId = session?.user?.id;
  const { data: membersData } = useQuery(
    trpc.teams.listMembers.queryOptions({ teamId: team.id }, { staleTime: 30_000 }),
  );
  const { data: invitesData } = useQuery(
    trpc.teams.listInvites.queryOptions({ teamId: team.id }, { staleTime: 30_000 }),
  );
  const members = membersData?.members ?? [];
  const invites = invitesData?.invites ?? [];
  const [email, setEmail] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: trpc.teams.listMembers.queryKey({ teamId: team.id }),
    });
    void queryClient.invalidateQueries({
      queryKey: trpc.teams.listInvites.queryKey({ teamId: team.id }),
    });
    onChanged();
  };
  const invite = useMutation(
    trpc.teams.invite.mutationOptions({
      onSuccess: () => {
        setEmail('');
        invalidate();
      },
    }),
  );
  const revokeInvite = useMutation(
    trpc.teams.revokeInvite.mutationOptions({ onSuccess: invalidate }),
  );
  const removeMember = useMutation(
    trpc.teams.removeMember.mutationOptions({ onSuccess: invalidate }),
  );
  const leaveTeam = useMutation(trpc.teams.leave.mutationOptions({ onSuccess: invalidate }));
  const deleteTeam = useMutation(trpc.teams.delete.mutationOptions({ onSuccess: invalidate }));
  const updatePrefs = useMutation(
    trpc.teams.updateMyPrefs.mutationOptions({ onSuccess: onChanged }),
  );

  const prefs = {
    onComment: team.prefs?.onComment ?? true,
    onMention: team.prefs?.onMention ?? true,
    onAssignment: team.prefs?.onAssignment ?? true,
  };
  const setPref = (key: keyof typeof prefs, value: boolean) =>
    updatePrefs.mutate({ teamId: team.id, prefs: { ...prefs, [key]: value } });

  return (
    <section
      aria-label={team.name}
      className="rounded-lg border border-[#E7E7E7] p-3 dark:border-[#252525]"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate">{team.name}</span>
          <Badge variant="outline" className="text-[10px]">
            {m['common.teams.memberCount']({ count: team.memberCount })}
          </Badge>
          {team.role === 'owner' && (
            <Badge variant="secondary" className="text-[10px]">
              owner
            </Badge>
          )}
        </h4>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={leaveTeam.isPending}
            onClick={() => leaveTeam.mutate({ teamId: team.id })}
          >
            {m['common.teams.leaveTeam']()}
          </Button>
          {team.role === 'owner' && (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              disabled={deleteTeam.isPending}
              onClick={() => deleteTeam.mutate({ teamId: team.id })}
            >
              {m['common.teams.deleteTeam']()}
            </Button>
          )}
        </div>
      </div>
      {leaveTeam.isError && (
        <p className="text-destructive mt-1 text-xs" role="alert">
          {String(leaveTeam.error)}
        </p>
      )}

      <div className="mt-3">
        <h5 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
          {m['common.teams.members']()}
        </h5>
        <ul className="space-y-1">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {member.name} <span className="text-muted-foreground text-xs">{member.email}</span>
                {member.role === 'owner' && (
                  <Badge variant="outline" className="ml-1 text-[9px]">
                    owner
                  </Badge>
                )}
              </span>
              {team.role === 'owner' && member.userId !== myUserId && member.role !== 'owner' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  aria-label={m['common.teams.removeMember']()}
                  disabled={removeMember.isPending}
                  onClick={() => removeMember.mutate({ teamId: team.id, userId: member.userId })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-[#9A9A9A]" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = email.trim();
          if (trimmed) invite.mutate({ teamId: team.id, email: trimmed });
        }}
      >
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={m['common.teams.invitePlaceholder']()}
          aria-label={m['common.teams.invite']()}
          className="h-8 max-w-xs text-sm"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8"
          disabled={!email.trim() || invite.isPending}
        >
          {invite.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            m['common.teams.invite']()
          )}
        </Button>
      </form>
      {invite.isError && (
        <p className="text-destructive mt-1 text-xs" role="alert">
          {String(invite.error)}
        </p>
      )}

      {invites.length > 0 && (
        <div className="mt-3">
          <h5 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
            {m['common.teams.invites']()}
          </h5>
          <ul className="space-y-1">
            {invites.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{row.email}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  disabled={revokeInvite.isPending}
                  onClick={() => revokeInvite.mutate({ inviteId: row.id })}
                >
                  {m['common.teams.revoke']()}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-4">
        {(
          [
            ['onComment', m['common.teams.prefComments']()],
            ['onMention', m['common.teams.prefMentions']()],
            ['onAssignment', m['common.teams.prefAssignments']()],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={prefs[key]}
              onCheckedChange={(checked) => setPref(key, checked === true)}
            />
            {label}
          </label>
        ))}
      </div>

      <TeamRulesBlock
        teamId={team.id}
        teamName={team.name}
        isOwner={team.role === 'owner'}
        members={members}
      />
    </section>
  );
}

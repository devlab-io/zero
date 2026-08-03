import {
  assignableRolesFor,
  canExportAudit,
  canManageTeam,
  type TeamRole,
} from '@/lib/team-roles-ui';
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
import { useRef, useState } from 'react';

const ROLE_LABELS: Record<TeamRole, () => string> = {
  owner: () => m['common.teams.roleOwner'](),
  admin: () => m['common.teams.roleAdmin'](),
  member: () => m['common.teams.roleMember'](),
  guest: () => m['common.teams.roleGuest'](),
  auditor: () => m['common.teams.roleAuditor'](),
};

/** Téléchargement client d'un document JSON (export d'audit signé, données). */
function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
    role: TeamRole;
    memberCount: number;
    prefs: { onComment: boolean; onMention: boolean; onAssignment: boolean } | null;
  };
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const myUserId = session?.user?.id;
  const canManage = canManageTeam(team.role);
  const invitableRoles = assignableRolesFor(team.role);
  const { data: membersData } = useQuery(
    trpc.teams.listMembers.queryOptions({ teamId: team.id }, { staleTime: 30_000 }),
  );
  const { data: invitesData } = useQuery(
    trpc.teams.listInvites.queryOptions(
      { teamId: team.id },
      { staleTime: 30_000, enabled: invitableRoles.length > 0 },
    ),
  );
  const members = membersData?.members ?? [];
  const invites = invitesData?.invites ?? [];
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('member');

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
  const setMemberRole = useMutation(
    trpc.teams.setMemberRole.mutationOptions({ onSuccess: invalidate }),
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
          {team.role !== 'member' && (
            <Badge variant="secondary" className="text-[10px]">
              {ROLE_LABELS[team.role]()}
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
          {members.map((member) => {
            const memberRole = member.role as TeamRole;
            // Miroir des gardes serveur : owners/admins ne sont touchés que
            // par un owner ; le rôle proposé doit être attribuable.
            const canEditTarget =
              canManage &&
              member.userId !== myUserId &&
              (team.role === 'owner' || (memberRole !== 'owner' && memberRole !== 'admin'));
            const roleOptions = invitableRoles.includes(memberRole)
              ? invitableRoles
              : [memberRole, ...invitableRoles];
            return (
              <li key={member.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {member.name}{' '}
                  <span className="text-muted-foreground text-xs">{member.email}</span>
                  {memberRole !== 'member' && (
                    <Badge variant="outline" className="ml-1 text-[9px]">
                      {ROLE_LABELS[memberRole]()}
                    </Badge>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {canEditTarget && (
                    <select
                      className="border-input bg-background h-6 rounded border px-1 text-xs"
                      aria-label={m['common.teams.roleChange']()}
                      value={memberRole}
                      disabled={setMemberRole.isPending}
                      onChange={(event) =>
                        setMemberRole.mutate({
                          teamId: team.id,
                          userId: member.userId,
                          role: event.target.value as TeamRole,
                        })
                      }
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]()}
                        </option>
                      ))}
                    </select>
                  )}
                  {canEditTarget && memberRole !== 'owner' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      aria-label={m['common.teams.removeMember']()}
                      disabled={removeMember.isPending}
                      onClick={() =>
                        removeMember.mutate({ teamId: team.id, userId: member.userId })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[#9A9A9A]" />
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {setMemberRole.isError && (
          <p className="text-destructive mt-1 text-xs" role="alert">
            {String(setMemberRole.error)}
          </p>
        )}
        <p className="text-muted-foreground mt-1 text-[11px]">{m['common.teams.rolesHint']()}</p>
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        // Un guest/auditor n'invite personne (invitableRoles vide) : pas de formulaire.
        hidden={invitableRoles.length === 0}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = email.trim();
          if (trimmed) invite.mutate({ teamId: team.id, email: trimmed, role: inviteRole });
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
        {invitableRoles.length > 1 && (
          <select
            className="border-input bg-background h-8 rounded border px-1 text-xs"
            aria-label={m['common.teams.roleChange']()}
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as TeamRole)}
          >
            {invitableRoles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]()}
              </option>
            ))}
          </select>
        )}
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

      <TeamRulesBlock teamId={team.id} teamName={team.name} isOwner={canManage} members={members} />

      {(canManage || canExportAudit(team.role)) && (
        <GovernanceBlock teamId={team.id} role={team.role} canManage={canManage} />
      )}
    </section>
  );
}

/**
 * Gouvernance P17 : export signé du journal, export/restauration des données
 * (owner/admin), rétention bornée. Un auditor ne voit que l'export d'audit.
 */
function GovernanceBlock({
  teamId,
  role,
  canManage,
}: {
  teamId: string;
  role: TeamRole;
  canManage: boolean;
}) {
  const trpc = useTRPC();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: retentionData } = useQuery(
    trpc.teams.getRetentionPolicy.queryOptions(
      { teamId },
      { staleTime: 30_000, enabled: canManage },
    ),
  );
  const policy = retentionData?.policy ?? null;
  const [retention, setRetention] = useState<{
    auditDays: number | null;
    ruleRunDays: number | null;
    notificationDays: number | null;
  } | null>(null);
  const effective = retention ?? {
    auditDays: policy?.auditDays ?? null,
    ruleRunDays: policy?.ruleRunDays ?? null,
    notificationDays: policy?.notificationDays ?? null,
  };

  const exportAudit = useMutation(trpc.teams.exportAudit.mutationOptions());
  const exportData = useMutation(trpc.teams.exportData.mutationOptions());
  const restoreData = useMutation(trpc.teams.restoreData.mutationOptions());
  const setRetentionPolicy = useMutation(
    trpc.teams.setRetentionPolicy.mutationOptions({
      onSuccess: () => setNotice(m['common.teams.retentionSaved']()),
    }),
  );

  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(
      message.includes('export_unavailable')
        ? m['common.teams.exportUnavailable']()
        : m['common.teams.exportFailed'](),
    );
  };

  const RETENTION_CHOICES = [null, 30, 90, 180, 365, 730] as const;
  const retentionSelect = (
    key: 'auditDays' | 'ruleRunDays' | 'notificationDays',
    label: string,
  ) => (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      <select
        className="border-input bg-background h-6 rounded border px-1 text-xs"
        value={effective[key] === null ? '' : String(effective[key])}
        onChange={(event) =>
          setRetention({
            ...effective,
            [key]: event.target.value === '' ? null : Number(event.target.value),
          })
        }
      >
        {RETENTION_CHOICES.map((choice) => (
          <option key={choice ?? 'keep'} value={choice === null ? '' : String(choice)}>
            {choice === null
              ? m['common.teams.retentionKeep']()
              : m['common.teams.retentionDays']({ days: choice })}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mt-4 border-t border-[#E7E7E7] pt-3 dark:border-[#252525]">
      <h5 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
        {m['common.teams.governance']()}
      </h5>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={exportAudit.isPending}
          onClick={() => {
            setError(null);
            exportAudit.mutate(
              { teamId },
              {
                onSuccess: (doc) => downloadJson(`reta-audit-${teamId}.json`, doc),
                onError: fail,
              },
            );
          }}
        >
          {m['common.teams.exportAudit']()}
        </Button>
        {canManage && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={exportData.isPending}
              onClick={() => {
                setError(null);
                exportData.mutate(
                  { teamId },
                  {
                    onSuccess: (payload) => downloadJson(`reta-team-${teamId}.json`, payload),
                    onError: fail,
                  },
                );
              }}
            >
              {m['common.teams.exportData']()}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={restoreData.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {restoreData.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                m['common.teams.restoreData']()
              )}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setError(null);
                setNotice(null);
                void file.text().then((text) => {
                  let payload: unknown;
                  try {
                    payload = JSON.parse(text);
                  } catch {
                    setError(m['common.teams.restoreFailed']());
                    return;
                  }
                  restoreData.mutate(
                    { payload: payload as never },
                    {
                      onSuccess: ({ report }) =>
                        setNotice(
                          m['common.teams.restoreDone']({
                            name: report.teamName,
                            threads: report.restored.threads,
                            skipped: report.skipped.length,
                          }),
                        ),
                      onError: () => setError(m['common.teams.restoreFailed']()),
                    },
                  );
                });
              }}
            />
          </>
        )}
      </div>

      {canManage && (
        <div className="mt-3 max-w-xs space-y-1">
          <h6 className="text-muted-foreground text-[11px] font-medium uppercase">
            {m['common.teams.retentionTitle']()}
          </h6>
          {retentionSelect('auditDays', m['common.teams.retentionAudit']())}
          {retentionSelect('ruleRunDays', m['common.teams.retentionRuleRuns']())}
          {retentionSelect('notificationDays', m['common.teams.retentionNotifications']())}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              disabled={retention === null || setRetentionPolicy.isPending}
              onClick={() => {
                setNotice(null);
                setRetentionPolicy.mutate({ teamId, ...effective });
              }}
            >
              {m['common.teams.retentionSave']()}
            </Button>
          </div>
          <p className="text-muted-foreground text-[11px]">{m['common.teams.retentionHint']()}</p>
        </div>
      )}

      {notice && (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {error}
        </p>
      )}
      {role === 'auditor' && !canManage && (
        <p className="text-muted-foreground mt-2 text-[11px]">{m['common.teams.rolesHint']()}</p>
      )}
    </div>
  );
}

import { Archive, Clock, Loader2, Mail, MailOpen, Tag, Trash2, UserPlus, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSnoozePicker } from '@/components/context/snooze-picker-context';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { summarizeAssignOutcomes } from '@/lib/assign-batch-summary';
import { useMyTeams, useTeamMembers } from '@/hooks/use-teams';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { useQueryState } from 'nuqs';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Barre d'actions BATCH de la sélection multiple (P5) — pilotée souris, à
 * parité avec le clavier existant (d, u/shift+u, mod+backspace, Escape) :
 * mêmes actions optimistes, donc même toast d'annulation (undo) et mêmes
 * frontières — la sélection ne porte QUE sur les lignes visibles du dossier
 * courant. Aucune action réseau directe ici : tout passe par
 * useOptimisticActions (file d'attente + undo + retry).
 */
export function BulkActionBar({
  selectedIds,
  folder,
  onExit,
}: {
  selectedIds: string[];
  folder: string;
  onExit: () => void;
}) {
  const {
    optimisticMarkAsRead,
    optimisticMarkAsUnread,
    optimisticMoveThreadsTo,
    optimisticDeleteThreads,
  } = useOptimisticActions();
  const { openSnoozePicker } = useSnoozePicker();
  const [, setPicker] = useQueryState('picker');
  const count = selectedIds.length;
  if (count === 0) return null;

  const actions: {
    key: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    hidden?: boolean;
    destructive?: boolean;
    run: () => void;
  }[] = [
    {
      key: 'archive',
      label: m['common.mail.archive'](),
      icon: Archive,
      hidden: folder === 'archive' || folder === 'bin',
      run: () => optimisticMoveThreadsTo(selectedIds, folder, 'archive'),
    },
    {
      key: 'read',
      label: m['common.mail.markAsRead'](),
      icon: MailOpen,
      run: () => optimisticMarkAsRead(selectedIds),
    },
    {
      key: 'unread',
      label: m['common.mail.markAsUnread'](),
      icon: Mail,
      run: () => optimisticMarkAsUnread(selectedIds),
    },
    {
      key: 'snooze',
      label: m['navigation.sidebar.snoozed'](),
      icon: Clock,
      hidden: folder === 'snoozed' || folder === 'bin',
      run: () => openSnoozePicker({ threadIds: selectedIds, folder }),
    },
    {
      key: 'labels',
      label: m['common.mail.labels'](),
      icon: Tag,
      // Ouvre le picker labels existant — il lit bulkSelected lui-même.
      run: () => void setPicker('labels'),
    },
    {
      key: 'bin',
      label: m['common.mail.moveToBin'](),
      icon: Trash2,
      hidden: folder === 'bin',
      destructive: true,
      run: () => optimisticDeleteThreads(selectedIds, folder),
    },
  ];

  return (
    <div
      className="flex flex-1 items-center justify-between gap-2"
      role="toolbar"
      aria-label={m['common.mail.selectedEmails']({ count })}
    >
      <span
        className="text-foreground shrink-0 text-sm font-medium tabular-nums"
        aria-live="polite"
      >
        {m['common.mail.selectedEmails']({ count })}
      </span>
      <div className="flex items-center gap-1">
        {actions
          .filter((action) => !action.hidden)
          .map((action) => (
            <Tooltip key={action.key}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={action.label}
                  className={
                    action.destructive
                      ? 'text-destructive hover:bg-destructive/10 h-8 gap-1.5 rounded-lg px-2 transition-colors duration-150'
                      : 'h-8 gap-1.5 rounded-lg px-2 transition-colors duration-150'
                  }
                  onClick={action.run}
                >
                  <action.icon className="h-4 w-4" />
                  <span className="hidden text-xs xl:inline">{action.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{action.label}</TooltipContent>
            </Tooltip>
          ))}
        <BatchAssignPopover selectedIds={selectedIds} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={onExit}
              className="h-8 gap-2 rounded-lg transition-colors duration-150"
            >
              <X className="h-3 w-3" />
              <span className="text-xs">ESC</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{m['common.actions.exitSelectionModeEsc']()}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * Assignation BATCH (P5) — ACL-safe de bout en bout : le serveur revalide
 * appartenance, prédicat d'accès par fil et accès de l'assigné ; tout fil non
 * partagé à l'équipe choisie est SKIPPÉ et le résultat l'énonce explicitement
 * (jamais de silence). Responsable UNIQUE par fil partagé.
 */
function BatchAssignPopover({ selectedIds }: { selectedIds: string[] }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const { data: teamsData } = useMyTeams();
  const teams = teamsData?.teams ?? [];
  const effectiveTeamId = teamId || teams[0]?.id || '';
  const { data: membersData } = useTeamMembers(open && effectiveTeamId ? effectiveTeamId : null);
  const members = membersData?.members ?? [];
  const assignMutation = useMutation(trpc.teams.assignSharedBatch.mutationOptions());

  if (teams.length === 0) return null;

  const apply = async () => {
    if (!effectiveTeamId || assignMutation.isPending) return;
    try {
      const result = await assignMutation.mutateAsync({
        teamId: effectiveTeamId,
        assigneeUserId: assigneeUserId || null,
        threadIds: selectedIds.slice(0, 50),
      });
      const summary = summarizeAssignOutcomes(
        { assigned: result.assigned, notShared: result.notShared, skipped: result.skipped },
        {
          assigned: (count) => m['common.teams.assignResultAssigned']({ count }),
          notShared: (count) => m['common.teams.assignResultNotShared']({ count }),
          skipped: (count) => m['common.teams.assignResultSkipped']({ count }),
        },
      );
      if (result.assigned > 0) toast.success(summary);
      else toast.info(summary || m['common.teams.assignResultNotShared']({ count: 0 }));
      setOpen(false);
    } catch {
      toast.error(m['common.teams.assignFailed']());
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={m['common.teams.assignBatch']()}
              className="h-8 gap-1.5 rounded-lg px-2 transition-colors duration-150"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden text-xs xl:inline">{m['common.teams.assignBatch']()}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{m['common.teams.assignBatch']()}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 space-y-2 p-3">
        <p className="text-sm font-medium">{m['common.teams.assignBatch']()}</p>
        <label className="block text-xs">
          <span className="text-muted-foreground">{m['common.teams.selectTeam']()}</span>
          <select
            value={effectiveTeamId}
            onChange={(event) => {
              setTeamId(event.target.value);
              setAssigneeUserId('');
            }}
            className="mt-1 h-8 w-full rounded-md border border-[#E7E7E7] bg-white px-2 text-sm dark:border-[#252525] dark:bg-[#1E1E1E]"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">{m['common.teams.assignee']()}</span>
          <select
            value={assigneeUserId}
            onChange={(event) => setAssigneeUserId(event.target.value)}
            className="mt-1 h-8 w-full rounded-md border border-[#E7E7E7] bg-white px-2 text-sm dark:border-[#252525] dark:bg-[#1E1E1E]"
          >
            <option value="">{m['common.teams.unassigned']()}</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-muted-foreground text-[11px]">{m['common.teams.assignBatchHint']()}</p>
        <Button
          size="sm"
          className="h-8 w-full"
          disabled={assignMutation.isPending || !effectiveTeamId}
          onClick={() => void apply()}
        >
          {assignMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            m['common.teams.assignApply']()
          )}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

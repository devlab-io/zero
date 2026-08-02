import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, Search, UserRoundPlus, Users } from 'lucide-react';
import { useMyTeams, useTeamMembers } from '@/hooks/use-teams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { m } from '@/paraglide/messages';
import { Link } from 'react-router';

export function ContactsPane() {
  const [search, setSearch] = useState('');
  const teamsQuery = useMyTeams();
  const team = teamsQuery.data?.teams[0] ?? null;
  const membersQuery = useTeamMembers(team?.id ?? null);
  const members = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    const rows = membersQuery.data?.members ?? [];
    if (!normalized) return rows;
    return rows.filter((member) =>
      `${member.name} ${member.email}`.toLocaleLowerCase().includes(normalized),
    );
  }, [membersQuery.data?.members, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border/60 space-y-3 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">{m['globalWorkspace.contacts.title']()}</p>
            <p className="text-muted-foreground truncate text-xs">
              {team?.name ?? m['globalWorkspace.contacts.team']()}
            </p>
          </div>
          <Button asChild variant="ghost" size="icon" className="size-9">
            <Link to="/settings/teams" aria-label={m['globalWorkspace.contacts.manage']()}>
              <UserRoundPlus className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-2.5 size-4" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={m['globalWorkspace.contacts.search']()}
            className="h-9 pl-9"
          />
        </div>
      </div>

      {teamsQuery.isPending || membersQuery.isPending ? (
        <div className="space-y-3 p-4 motion-safe:animate-pulse">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="bg-muted size-9 rounded-full" />
              <div className="bg-muted h-3 flex-1 rounded" />
            </div>
          ))}
        </div>
      ) : !team ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <Users className="text-muted-foreground mb-3 size-6" />
          <p className="text-sm font-medium">{m['globalWorkspace.contacts.noTeam']()}</p>
        </div>
      ) : members.length === 0 ? (
        <p className="text-muted-foreground px-6 py-12 text-center text-sm">
          {m['globalWorkspace.contacts.noResults']()}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {members.map((member) => (
            <li
              key={member.userId}
              className="hover:bg-muted/60 flex items-center gap-3 rounded-lg px-2 py-2"
            >
              <Avatar className="size-9">
                <AvatarImage src={member.image ?? undefined} alt="" />
                <AvatarFallback>{member.name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.name}</p>
                <p className="text-muted-foreground truncate text-xs">{member.email}</p>
              </div>
              <Button asChild variant="ghost" size="icon" className="size-9 shrink-0">
                <Link
                  to={`/mail/compose?to=${encodeURIComponent(member.email)}`}
                  aria-label={m['globalWorkspace.contacts.email']({ name: member.name })}
                >
                  <Mail className="size-4" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

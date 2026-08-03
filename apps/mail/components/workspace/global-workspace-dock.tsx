import { Activity, CalendarDays, ContactRound, PanelRightClose } from 'lucide-react';
import { useGlobalWorkspace } from './global-workspace-context';
import type { WorkspaceTab } from './global-workspace-model';
import { Button } from '@/components/ui/button';
import { ContactsPane } from './contacts-pane';
import { CalendarPane } from './calendar-pane';
import { ActivityPane } from './activity-pane';
import { m } from '@/paraglide/messages';
import { cn } from '@/lib/utils';
import { useRef } from 'react';

const tabs = [
  { id: 'calendar' as const, icon: CalendarDays, label: () => m['globalWorkspace.calendar.tab']() },
  { id: 'activity' as const, icon: Activity, label: () => m['globalWorkspace.activity.tab']() },
  { id: 'contacts' as const, icon: ContactRound, label: () => m['globalWorkspace.contacts.tab']() },
];

export function GlobalWorkspaceDock() {
  const { open, tab, chooseWorkspaceTab, closeWorkspace } = useGlobalWorkspace();
  const dockTriggerRef = useRef<HTMLButtonElement>(null);

  const choose = (next: WorkspaceTab) => {
    chooseWorkspaceTab(next);
  };
  const close = () => {
    closeWorkspace();
    requestAnimationFrame(() => dockTriggerRef.current?.focus());
  };

  return (
    <>
      {!open && (
        <aside
          aria-label={m['globalWorkspace.open']()}
          className="border-border/70 bg-background/95 fixed right-2 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1 rounded-xl border p-1 shadow-lg backdrop-blur-md"
        >
          {tabs.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              ref={id === 'calendar' ? dockTriggerRef : undefined}
              variant="ghost"
              size="icon"
              className="size-10"
              aria-label={label()}
              title={label()}
              onClick={() => choose(id)}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </aside>
      )}

      {/* Sur tablette et desktop, le panneau réserve sa place. Le shell mail
          passe alors en mode lecteur + workspace au lieu de laisser ce dock
          recouvrir le message ouvert. Sur mobile, il reste un overlay. */}
      <aside
        aria-label={m['globalWorkspace.title']()}
        aria-hidden={!open}
        className={cn(
          'border-border/70 bg-background z-40 flex flex-col overflow-hidden rounded-2xl border transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
          open
            ? 'fixed inset-y-2 right-2 w-[min(390px,calc(100vw-16px))] translate-x-0 opacity-100 shadow-2xl md:static md:inset-auto md:mb-1 md:mr-0.5 md:mt-1 md:h-[calc(100dvh-8px)] md:w-[340px] md:shrink-0 md:shadow-sm xl:w-[360px]'
            : 'pointer-events-none fixed inset-y-2 right-2 w-[min(390px,calc(100vw-16px))] translate-x-[calc(100%+16px)] opacity-0 shadow-2xl',
        )}
      >
        <header className="border-border/60 flex h-14 items-center justify-between border-b px-2">
          <nav aria-label={m['globalWorkspace.tabs']()} className="flex items-center gap-1">
            {tabs.map(({ id, icon: Icon, label }) => (
              <Button
                key={id}
                variant="ghost"
                size="sm"
                aria-current={tab === id ? 'page' : undefined}
                className={cn(
                  'h-10 gap-2 px-2.5 text-xs',
                  tab === id && 'bg-muted text-foreground',
                )}
                onClick={() => choose(id)}
              >
                <Icon className="size-4" />
                <span className="hidden min-[350px]:inline">{label()}</span>
              </Button>
            ))}
          </nav>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            aria-label={m['globalWorkspace.close']()}
            onClick={close}
          >
            <PanelRightClose className="size-4" />
          </Button>
        </header>
        {open &&
          (tab === 'calendar' ? (
            <CalendarPane />
          ) : tab === 'activity' ? (
            <ActivityPane />
          ) : (
            <ContactsPane />
          ))}
      </aside>
    </>
  );
}

import { Activity, CalendarDays, ContactRound, PanelRightClose } from 'lucide-react';
import type { WorkspaceTab } from './global-workspace-model';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ContactsPane } from './contacts-pane';
import { CalendarPane } from './calendar-pane';
import { ActivityPane } from './activity-pane';
import { m } from '@/paraglide/messages';
import { cn } from '@/lib/utils';

const OPEN_KEY = 'reta-global-workspace-open';
const TAB_KEY = 'reta-global-workspace-tab';

const tabs = [
  { id: 'calendar' as const, icon: CalendarDays, label: () => m['globalWorkspace.calendar.tab']() },
  { id: 'activity' as const, icon: Activity, label: () => m['globalWorkspace.activity.tab']() },
  { id: 'contacts' as const, icon: ContactRound, label: () => m['globalWorkspace.contacts.tab']() },
];

export function GlobalWorkspaceDock() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>('calendar');
  const dockTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === 'true');
      const stored = localStorage.getItem(TAB_KEY);
      if (stored === 'calendar' || stored === 'activity' || stored === 'contacts') setTab(stored);
    } catch {
      // Private mode/storage denial: the global panel still works in-memory.
    }
  }, []);

  const choose = (next: WorkspaceTab) => {
    setTab(next);
    setOpen(true);
    try {
      localStorage.setItem(TAB_KEY, next);
      localStorage.setItem(OPEN_KEY, 'true');
    } catch {
      // In-memory fallback.
    }
  };
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(OPEN_KEY, 'false');
    } catch {
      // In-memory fallback.
    }
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

      {/* CUA P1 (largeur intermédiaire) : ouvert, le panneau RÉSERVE sa place
          dans le shell à partir de xl (le mail se replie au lieu d'être
          recouvert/tronqué) ; en dessous il reste un overlay, un peu plus
          étroit en md pour laisser respirer la liste. */}
      <aside
        aria-label={m['globalWorkspace.title']()}
        aria-hidden={!open}
        className={cn(
          'border-border/70 bg-background z-40 flex flex-col overflow-hidden rounded-2xl border transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
          open
            ? 'fixed inset-y-2 right-2 w-[min(390px,calc(100vw-16px))] translate-x-0 opacity-100 shadow-2xl md:w-[340px] xl:static xl:inset-auto xl:mb-1 xl:mr-0.5 xl:mt-1 xl:h-[calc(100dvh-8px)] xl:w-[360px] xl:shrink-0 xl:shadow-sm'
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

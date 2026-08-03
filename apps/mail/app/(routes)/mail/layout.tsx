import { useGlobalWorkspace } from '@/components/workspace/global-workspace-context';
import { DeferredAppSidebar } from '@/components/ui/app-sidebar.deferred';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Outlet } from 'react-router';

// HotkeyProviderWrapper is mounted once at the (routes) root layout, which already
// wraps every mail route via <Outlet />. Mounting it again here registered every
// hotkey handler twice (double-undo). Structural de-dup — bindings unchanged.
export default function MailLayout() {
  const { open: workspaceOpen } = useGlobalWorkspace();
  const compactWorkspace = useMediaQuery('(min-width: 768px) and (max-width: 1279px)');

  return (
    <>
      {/* r13 : sidebar hors du graphe critique — placeholder iso-largeur puis
          chargement après premier paint + idle (voir app-sidebar.deferred). */}
      <div className={workspaceOpen && compactWorkspace ? 'hidden' : 'contents'}>
        <DeferredAppSidebar />
      </div>
      <div className="bg-sidebar dark:bg-sidebar min-w-0 flex-1">
        <Outlet />
      </div>
    </>
  );
}

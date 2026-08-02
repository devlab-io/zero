import { DeferredAppSidebar } from '@/components/ui/app-sidebar.deferred';
import { Outlet } from 'react-router';

// HotkeyProviderWrapper is mounted once at the (routes) root layout, which already
// wraps every mail route via <Outlet />. Mounting it again here registered every
// hotkey handler twice (double-undo). Structural de-dup — bindings unchanged.
export default function MailLayout() {
  return (
    <>
      {/* r13 : sidebar hors du graphe critique — placeholder iso-largeur puis
          chargement après premier paint + idle (voir app-sidebar.deferred). */}
      <DeferredAppSidebar />
      <div className="bg-sidebar dark:bg-sidebar w-full">
        <Outlet />
      </div>
    </>
  );
}

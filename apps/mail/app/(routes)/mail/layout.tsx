import { DeferredAppSidebar } from '@/components/ui/app-sidebar.deferred';
import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router';

// w2cd (client weight): the onboarding dialog (canvas-confetti + videos) only
// shows for first-run users. Lazy-load it so it stays out of the critical inbox
// bundle; it mounts silently for everyone else.
const OnboardingWrapper = lazy(() =>
  import('@/components/onboarding').then((mod) => ({ default: mod.OnboardingWrapper })),
);

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
      <Suspense fallback={null}>
        <OnboardingWrapper />
      </Suspense>
    </>
  );
}

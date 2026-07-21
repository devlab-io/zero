import { AppSidebar } from '@/components/ui/app-sidebar';
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
      <AppSidebar />
      <div className="bg-sidebar dark:bg-sidebar w-full">
        <Outlet />
      </div>
      <Suspense fallback={null}>
        <OnboardingWrapper />
      </Suspense>
    </>
  );
}

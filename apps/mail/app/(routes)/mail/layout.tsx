import { OnboardingWrapper } from '@/components/onboarding';
import { AppSidebar } from '@/components/ui/app-sidebar';
import { Outlet } from 'react-router';

// HotkeyProviderWrapper is mounted once at the (routes) root layout, which already
// wraps every mail route via <Outlet />. Mounting it again here registered every
// hotkey handler twice (double-undo). Structural de-dup — bindings unchanged.
export default function MailLayout() {
  return (
    <>
      <AppSidebar />
      <main id="main-content" className="bg-sidebar dark:bg-sidebar w-full min-w-0">
        <Outlet />
      </main>
      <OnboardingWrapper />
    </>
  );
}

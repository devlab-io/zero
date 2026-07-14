import { QueueReview } from '@/components/queue/queue-review';
import { OnboardingWrapper } from '@/components/onboarding';
import { AppSidebar } from '@/components/ui/app-sidebar';

export default function QueuePage() {
  return (
    <>
      <AppSidebar />
      <main id="main-content" className="min-w-0 flex-1">
        <QueueReview />
      </main>
      <OnboardingWrapper />
    </>
  );
}

import { QueueReview } from '@/components/queue/queue-review';
import { OnboardingWrapper } from '@/components/onboarding';
import { AppSidebar } from '@/components/ui/app-sidebar';

export default function QueuePage() {
  return (
    <>
      <AppSidebar />
      <QueueReview />
      <OnboardingWrapper />
    </>
  );
}

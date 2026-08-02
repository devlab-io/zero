import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useState, useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';

export function OnboardingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const steps: {
    title: string;
    description: ReactNode;
    video?: string;
    image?: string;
  }[] = [
    {
      title: m['common.onboarding.welcomeTitle'](),
      description: m['common.onboarding.welcomeDescription'](),
      image: '/onboarding/get-started.webp',
    },
    {
      title: m['common.onboarding.chatTitle'](),
      description: m['common.onboarding.chatDescription'](),
      video: '/onboarding/step2.mp4',
    },
    {
      title: m['common.onboarding.composeTitle'](),
      description: m['common.onboarding.composeDescription'](),
      video: '/onboarding/step1.mp4',
    },
    {
      title: m['common.onboarding.labelTitle'](),
      description: m['common.onboarding.labelDescription'](),
      video: '/onboarding/step3.mp4',
    },
    {
      title: m['common.onboarding.comingSoonTitle'](),
      description: m['common.onboarding.comingSoonDescription'](),
      image: '/onboarding/coming-soon.webp',
    },
    {
      title: m['common.onboarding.readyTitle'](),
      description: m['common.onboarding.readyDescription'](),
      image: '/onboarding/ready.webp',
    },
  ];
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle></DialogTitle>
      <DialogContent
        showOverlay
        className="bg-panelLight mx-auto w-full max-w-[90%] rounded-xl border p-0 sm:max-w-[690px] dark:bg-[#111111]"
      >
        <div className="flex flex-col gap-4 p-4">
          {steps[currentStep] && (steps[currentStep].video || steps[currentStep].image) && (
            <div className="relative flex items-center justify-center">
              <div className="bg-muted aspect-video w-full max-w-4xl overflow-hidden rounded-lg">
                {steps.map(
                  (step, index) =>
                    (step.video || step.image) && (
                      <div
                        key={step.title}
                        className={`absolute inset-0 transition-opacity duration-300 ${
                          index === currentStep ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        {step.video ? (
                          <video
                            autoPlay
                            muted
                            loop
                            playsInline
                            width={500}
                            height={500}
                            src={step.video}
                            aria-label={step.title}
                            className="h-full w-full rounded-lg border object-cover"
                          />
                        ) : (
                          <img
                            loading="eager"
                            width={500}
                            height={500}
                            src={step.image}
                            alt={step.title}
                            className="h-full w-full rounded-lg border object-cover"
                          />
                        )}
                      </div>
                    ),
                )}
              </div>
            </div>
          )}
          <div className="space-y-0">
            <h2 className="text-4xl font-semibold">{steps[currentStep]?.title}</h2>
            <p className="text-muted-foreground max-w-xl text-sm">
              {steps[currentStep]?.description}
            </p>
          </div>

          <div className="mx-auto flex w-full justify-between">
            <div className="flex gap-2">
              <Button
                size={'xs'}
                onClick={() => setCurrentStep(currentStep - 1)}
                variant="outline"
                disabled={currentStep === 0}
              >
                {m['common.onboarding.goBack']()}
              </Button>
              <Button size={'xs'} onClick={handleNext}>
                {currentStep === steps.length - 1
                  ? m['common.onboarding.getStarted']()
                  : m['common.onboarding.next']()}
              </Button>
            </div>
            <div className="flex items-center justify-center">
              <div className="flex gap-1">
                {steps.map((_, index) => (
                  <div
                    key={_.title}
                    className={`h-1 w-4 rounded-full md:w-10 ${
                      index === currentStep ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OnboardingWrapper() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const ONBOARDING_KEY = 'hasCompletedOnboarding';

  useEffect(() => {
    const hasCompletedOnboarding = localStorage.getItem(ONBOARDING_KEY) === 'true';
    setShowOnboarding(!hasCompletedOnboarding);
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      localStorage.setItem(ONBOARDING_KEY, 'true');
    }
    setShowOnboarding(open);
  };

  return <OnboardingDialog open={showOnboarding} onOpenChange={handleOpenChange} />;
}

import { PixelatedLeft, PixelatedRight } from '@/components/home/pixelated-bg';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { signIn, useSession } from '@/lib/auth-client';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Balancer } from 'react-wrap-balancer';
import { toast } from 'sonner';

const tabs = [
  { label: 'Chat With Your Inbox', value: 'smart-categorization' },
  { label: 'Smart Labels', value: 'ai-features' },
  { label: 'Write Better Emails', value: 'feature-3' },
];

export function HomeHero() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  return (
    <>
      <section className="z-10 mt-32 flex flex-col items-center px-4">
        {/* Prerender-safe entrance: framer initial={opacity:0} was serialized into the
            prerendered index.html, hiding the hero until JS boot (FCP=LCP=boot). CSS
            animate-fade-up (translate only, never opacity:0) paints at CSS-parse time. */}
        <h1 className="animate-fade-up text-center text-4xl font-medium [animation-delay:0.2s] md:text-6xl">
          <Balancer className="mb-3 max-w-[1130px]">
            AI Powered Email, Built to Save You Time
          </Balancer>
        </h1>
        <p className="animate-fade-up mx-auto mb-4 max-w-2xl text-center text-base font-medium text-zinc-600 [animation-delay:0.4s] md:text-lg dark:text-[#B7B7B7]">
          Zero is an AI-native email client that manages your inbox, so you don&apos;t have to.
        </p>
        <p className="mb-4 ml-0.5 text-xs text-zinc-500 dark:text-[#B7B7B7]/60">
          No credit card required.
        </p>
        <div className="animate-fade-up border-input/50 mb-6 inline-flex items-center gap-4 rounded-full border border-zinc-200 bg-white px-4 py-1 shadow-sm dark:border-[#2A2A2A] dark:bg-[#1E1E1E] dark:shadow-none">
          <Link to="https://yc.vc" target="_blank" className="flex items-center gap-2 text-sm">
            Backed by
            <span>
              <img
                src="/yc-small.svg"
                alt="Y Combinator"
                className="rounded-[2px]"
                width={18}
                height={18}
              />
            </span>
            Combinator
          </Link>
        </div>

        {/* Get Started button only visible for mobile screens */}
        <div className="animate-fade-up mb-6 [animation-delay:0.6s] lg:hidden">
          <Button
            onClick={() => {
              if (session) {
                navigate('/mail/inbox');
              } else {
                toast.promise(
                  signIn.social({
                    provider: 'google',
                    callbackURL: `${window.location.origin}/mail`,
                  }),
                  {
                    error: 'Login redirect failed',
                  },
                );
              }
            }}
          >
            Get Started
          </Button>
        </div>
      </section>

      <section className="relative mt-10 hidden flex-col justify-center md:flex">
        <div className="bg-border absolute left-1/2 top-0 h-px w-full -translate-x-1/2 md:container xl:max-w-7xl" />
        <Tabs
          defaultValue="smart-categorization"
          className="flex w-full flex-col items-center gap-0"
        >
          <div
            className="relative bottom-2 flex w-full justify-center md:border-t"
            style={{ clipPath: 'inset(0 0 0 0)', height: '110%' }}
          >
            <div className="container relative -top-1.5 md:border-x xl:max-w-7xl">
              <PixelatedLeft
                className="absolute left-0 top-0 -z-10 hidden h-full w-auto -translate-x-full opacity-50 md:block"
                style={{ mixBlendMode: 'screen' }}
              />
              <PixelatedRight
                className="absolute right-0 top-0 -z-10 hidden h-full w-auto translate-x-full opacity-50 md:block"
                style={{ mixBlendMode: 'screen' }}
              />
              {tabs.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>
                  <img
                    src="/email-preview.png"
                    alt="Zero Email Preview"
                    width={1920}
                    height={1080}
                    className="relative hidden md:block"
                    loading="eager"
                  />
                </TabsContent>
              ))}
            </div>
          </div>
        </Tabs>
      </section>

      <div className="flex items-center justify-center px-4 md:hidden">
        <img
          src="/email-preview.png"
          alt="Zero Email Preview"
          width={1920}
          height={1080}
          className="mt-10 h-fit w-full rounded-xl border"
          loading="eager"
        />
      </div>

      <div className="relative -top-3.5 hidden h-px w-full bg-zinc-200 md:block dark:bg-[#313135]" />
    </>
  );
}

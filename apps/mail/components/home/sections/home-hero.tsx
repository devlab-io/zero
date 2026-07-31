import { PixelatedLeft, PixelatedRight } from '@/components/home/pixelated-bg';
import { DevlabMark, DevlabWordmark } from '@/components/brand/devlab-brand';
import { Cube, Lightning, Puzzle } from '@/components/icons/icons';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { signIn, useSession } from '@/lib/auth-client';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Balancer } from 'react-wrap-balancer';
import { productBrand } from '@/lib/brand';
import { toast } from 'sonner';

const tabs = [
  { label: 'Fast Inbox', value: 'smart-categorization' },
  { label: 'Keyboard First', value: 'ai-features' },
  { label: 'Your Tools, Your Rules', value: 'feature-3' },
];

const pillars = [
  { label: 'Lightning fast', icon: Lightning },
  { label: 'Keyboard first', glyph: '⌘' },
  { label: 'API-first', icon: Cube },
  { label: 'AI-agnostic', icon: Puzzle },
] as const;

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
          <Balancer className="mb-3 max-w-[1130px]">Email at the Speed of Thought</Balancer>
        </h1>
        <p className="animate-fade-up mx-auto mb-4 max-w-2xl text-center text-base font-medium text-zinc-600 [animation-delay:0.4s] md:text-lg dark:text-[#B7B7B7]">
          {productBrand.name} is the lightning-fast, keyboard-first email client built in Tahiti by
          Devlab. API-first and AI-agnostic — your inbox, your models, your rules.
        </p>
        <p className="mb-4 ml-0.5 text-xs text-zinc-500 dark:text-[#B7B7B7]/60">
          No credit card required.
        </p>
        <div className="animate-fade-up border-input/50 mb-4 inline-flex items-center gap-4 rounded-full border border-[#6f00ff]/20 bg-white px-4 py-1 shadow-sm dark:border-[#9d6dff]/30 dark:bg-[#1E1E1E] dark:shadow-none">
          <Link
            to={productBrand.companyUrl}
            target="_blank"
            className="flex items-center gap-2 text-sm text-[#140151] dark:text-white"
          >
            <span className="flex size-[18px] items-center justify-center rounded-[5px] bg-[#6f00ff] text-white">
              <DevlabMark className="size-2.5" />
            </span>
            Built in Tahiti by
            <DevlabWordmark className="h-3 w-auto" />
          </Link>
        </div>

        <div className="animate-fade-up mb-6 flex flex-wrap items-center justify-center gap-2 [animation-delay:0.5s]">
          {pillars.map((pillar) => (
            <span
              key={pillar.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 dark:border-[#2A2A2A] dark:bg-[#1E1E1E] dark:text-[#B7B7B7]"
            >
              {'icon' in pillar ? (
                <pillar.icon className="size-3 fill-[#6f00ff] dark:fill-[#c9afff]" />
              ) : (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-[#f1e8ff] px-0.5 text-[10px] font-semibold leading-none text-[#6f00ff] dark:bg-[#6f00ff]/15 dark:text-[#c9afff]">
                  {pillar.glyph}
                </span>
              )}
              {pillar.label}
            </span>
          ))}
        </div>

        {/* Get Started button only visible for mobile screens */}
        <div className="animate-fade-up mb-6 [animation-delay:0.6s] lg:hidden">
          <Button
            className="bg-[#6f00ff] text-white hover:bg-[#5600ff]"
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
                    alt={`${productBrand.name} email preview`}
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
          alt={`${productBrand.name} email preview`}
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

import { Cube, GroupPeople, Lightning, Puzzle } from '@/components/icons/icons';
import { DevlabMark, DevlabWordmark } from '@/components/brand/devlab-brand';
import { signIn, useSession } from '@/lib/auth-client';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Balancer } from 'react-wrap-balancer';
import { productBrand } from '@/lib/brand';
import { toast } from 'sonner';

const pillars = [
  { label: 'Keyboard workflow', icon: Lightning },
  { label: 'Keyboard first', glyph: '⌘' },
  { label: 'Team-native', icon: GroupPeople },
  { label: 'AI-agnostic', icon: Puzzle },
  { label: 'API-first', icon: Cube },
] as const;

export function HomeHero() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  return (
    <>
      <section className="z-10 mt-32 flex flex-col items-center px-4">
        <h1 className="text-center text-4xl font-medium md:text-6xl">
          <Balancer className="mb-3 max-w-[1130px]">
            The team inbox built for keyboard work
          </Balancer>
        </h1>
        <p className="mx-auto mb-4 max-w-2xl text-center text-base font-medium text-zinc-600 md:text-lg dark:text-zinc-300">
          {productBrand.name} is an email client built in Tahiti by Devlab. Navigate and reply with
          the keyboard, then share the thread with your team, comment internally and assign it to
          Done — without moving the conversation to chat.
        </p>
        <p className="mb-4 ml-0.5 text-xs text-zinc-600 dark:text-zinc-300">
          No credit card required.
        </p>
        <div className="border-input/50 mb-4 inline-flex items-center gap-4 rounded-lg border border-[#6f00ff]/20 bg-white px-4 py-1 shadow-sm dark:border-[#9d6dff]/30 dark:bg-[#1E1E1E] dark:shadow-none">
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

        <ul className="mb-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {pillars.map((pillar) => (
            <li key={pillar.label} className="inline-flex items-center gap-1.5">
              {'icon' in pillar ? (
                <pillar.icon className="size-3 fill-[#6f00ff] dark:fill-[#c9afff]" />
              ) : (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-[#f1e8ff] px-0.5 text-[10px] font-semibold leading-none text-[#6f00ff] dark:bg-[#6f00ff]/15 dark:text-[#c9afff]">
                  {pillar.glyph}
                </span>
              )}
              {pillar.label}
            </li>
          ))}
        </ul>

        {/* Get Started button only visible for mobile screens */}
        <div className="mb-6 lg:hidden">
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
        <div
          className="relative flex w-full justify-center"
          style={{ clipPath: 'inset(0 0 0 0)', height: '110%' }}
        >
          <div className="container relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm xl:max-w-7xl dark:border-[#2A2A2A] dark:bg-[#1A1A1A]">
            <img
              src="/email-preview.png"
              alt={`${productBrand.name} email preview`}
              width={1920}
              height={1080}
              className="relative hidden md:block"
              loading="eager"
            />
          </div>
        </div>
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
    </>
  );
}

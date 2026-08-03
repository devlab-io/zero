import { DevlabMark, DevlabWordmark } from '@/components/brand/devlab-brand';
import { GroupPeople, Lightning, Puzzle } from '@/components/icons/icons';
import { Button } from '@/components/ui/button';
import { Balancer } from 'react-wrap-balancer';
import { productBrand } from '@/lib/brand';
import { Link } from 'react-router';

const pillars = [
  { label: 'Keyboard-first', icon: Lightning },
  { label: 'Thread-native teamwork', icon: GroupPeople },
  { label: 'AI on your terms', icon: Puzzle },
] as const;

export function HomeHero() {
  return (
    <>
      <section className="z-10 mt-32 flex flex-col items-center px-4">
        <h1 className="text-balance text-center text-4xl font-medium tracking-[-0.03em] md:text-6xl">
          <Balancer className="mb-3 max-w-[1130px]">
            Handle email together, without moving it to chat
          </Balancer>
        </h1>
        <p className="mx-auto mb-4 max-w-2xl text-center text-base font-medium text-zinc-600 md:text-lg dark:text-zinc-300">
          {productBrand.name} is a keyboard-first email client built in Tahiti by Devlab. Share only
          the threads that need a team, comment privately, assign the next reply and keep the email
          conversation intact.
        </p>
        <p className="mb-5 text-center text-sm text-zinc-600 dark:text-zinc-300">
          Keep your existing address. Team access starts only when you share a thread. No credit
          card required.
        </p>
        <div className="border-input/50 border-brand-violet/20 dark:border-brand-violet/30 mb-5 inline-flex items-center gap-4 rounded-lg border bg-white px-4 py-1 shadow-sm dark:bg-[#1E1E1E] dark:shadow-none">
          <Link
            to={productBrand.companyUrl}
            target="_blank"
            className="text-brand-navy focus-visible:ring-brand-violet flex items-center gap-2 rounded text-sm focus-visible:outline-none focus-visible:ring-2 dark:text-white"
          >
            <span className="bg-brand-violet flex size-[18px] items-center justify-center rounded-[5px] text-white">
              <DevlabMark className="size-2.5" />
            </span>
            Built in Tahiti by
            <DevlabWordmark className="h-3 w-auto" />
          </Link>
        </div>

        <ul className="mb-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {pillars.map((pillar) => (
            <li key={pillar.label} className="inline-flex items-center gap-1.5">
              <pillar.icon className="fill-brand-violet size-3 dark:fill-[#c9afff]" />
              {pillar.label}
            </li>
          ))}
        </ul>

        <div className="mb-6">
          <Button asChild className="bg-brand-violet hover:bg-brand-violet-deep text-white">
            <Link to="/login">Get started</Link>
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
              alt={`${productBrand.name} split inbox showing a thread, attachments and reply controls`}
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
          alt={`${productBrand.name} split inbox showing a thread, attachments and reply controls`}
          width={1920}
          height={1080}
          className="mt-10 h-fit w-full rounded-xl border"
          loading="eager"
        />
      </div>
    </>
  );
}

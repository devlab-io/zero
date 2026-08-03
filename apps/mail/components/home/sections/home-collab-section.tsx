import { GroupPeople } from '@/components/icons/icons';
import { productBrand } from '@/lib/brand';

/**
 * Section collaboration — le différenciateur produit. Maquette HONNÊTE : un
 * fil partagé avec commentaire interne, assignation et statut, construite sur
 * les tokens clair/sombre du site (aucun export Figma, aucune capture floue).
 * Statique : aucune animation décorative.
 */

const points = [
  {
    title: 'Internal comments & @mentions',
    detail: 'Discuss a thread privately with your team — your correspondent never sees it.',
  },
  {
    title: 'Assign, then Done',
    detail: 'Every shared thread can have one assignee and one status. No “who has this?” again.',
  },
  {
    title: 'Access you can audit',
    detail:
      'Share to the whole team or a restricted list. Widening is explicit, revocable and logged.',
  },
];

export function HomeCollabSection() {
  return (
    <section aria-labelledby="collaboration-heading" className="relative mt-32 px-4 md:mt-40">
      <p className="text-center text-lg font-light text-zinc-600 md:text-xl dark:text-zinc-200">
        Team collaboration, email-first
      </p>
      <div className="mt-2 flex flex-col items-center justify-center md:mt-8">
        <h2
          id="collaboration-heading"
          className="mb-3 text-balance text-center text-4xl font-medium tracking-[-0.03em] text-zinc-950 md:text-6xl dark:text-white"
        >
          <span className="block">Share the thread</span>
          <span className="block text-zinc-600 dark:text-zinc-200">not another app</span>
        </h2>
      </div>
      <p className="mx-auto mb-10 max-w-2xl text-center text-base font-normal text-zinc-600 dark:text-zinc-200">
        No channels, no copies, no context lost. Pick an email thread, share it with your team in
        {` ${productBrand.name}`}, and work it to Done together — comments, assignment and access
        control stay attached to the thread itself.
      </p>

      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-1 items-center gap-10 md:grid-cols-2">
        <ul className="flex flex-col gap-6">
          {points.map((point) => (
            <li key={point.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="bg-brand-violet mt-1.5 size-1.5 shrink-0 rounded-full dark:bg-[#c9afff]"
              />
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{point.title}</p>
                <p className="mt-1 max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-200">
                  {point.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {/* Fil partagé — maquette sur tokens, cohérente clair/sombre */}
        <div
          role="img"
          aria-label="Shared email thread assigned to Moana, marked Done, with a private internal comment"
          className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-[#2A2A2A] dark:bg-[#1A1A1A]"
        >
          <div aria-hidden="true">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-[#252525]">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                Re: Renewal quote — Pacific Freight
              </p>
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                Done
              </span>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <GroupPeople className="size-3.5 fill-zinc-400" />
                Shared with Sales · assigned to Moana
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-300">
                Thanks for the updated quote — can you confirm the freight surcharge before Friday?
              </div>
              <div className="rounded-lg border border-[#6f00ff]/15 bg-[#f1e8ff]/60 px-3 py-2 dark:border-[#9d6dff]/20 dark:bg-[#6f00ff]/10">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#6f00ff] dark:text-[#c9afff]">
                  Internal comment
                </p>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium text-[#6f00ff] dark:text-[#c9afff]">@Moana</span>{' '}
                  surcharge confirmed with the carrier — you can reply and close this one.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

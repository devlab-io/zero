import { Filter, Lightning, Search } from '@/components/icons/icons';
import { productBrand } from '@/lib/brand';

/**
 * Trio de fondamentaux — liste éditoriale différenciée (pas de grille de
 * cartes identiques, pas de maquettes d'export Figma). Statique, tokens
 * clair/sombre.
 */

const features = [
  {
    icon: Lightning,
    title: 'An interface built for flow',
    detail: `Keyboard navigation, prefetched thread data and immediate action feedback help ${productBrand.name} keep routine inbox work moving.`,
  },
  {
    icon: Search,
    title: 'Search that finds the message',
    detail:
      'Use plain words or supported operators such as is:shared, is:assigned, has:comment and has:mention.',
  },
  {
    icon: Filter,
    title: 'Order without effort',
    detail:
      'Labels, categories, snooze and split inboxes keep the noise out of the way while you work the threads that matter.',
  },
] as const;

export function HomeFeatureCards() {
  return (
    <section className="relative mt-32 px-4 md:mt-40">
      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-3">
        {features.map((feature) => (
          <article key={feature.title} className="flex flex-col items-start">
            <span className="mb-4 flex size-9 items-center justify-center rounded-xl bg-[#f1e8ff] dark:bg-[#6f00ff]/15">
              <feature.icon className="size-4 fill-[#6f00ff] dark:fill-[#c9afff]" />
            </span>
            <h2 className="mb-2 text-xl font-medium text-zinc-950 dark:text-white">
              {feature.title}
            </h2>
            <p className="max-w-sm text-sm font-light leading-6 text-zinc-600 dark:text-zinc-200">
              {feature.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

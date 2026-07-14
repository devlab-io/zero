import { FeatureCardInterface } from './feature-card-interface';
import { FeatureCardSummaries } from './feature-card-summaries';
import { FeatureCardSearch } from './feature-card-search';

export function HomeFeatureCards() {
  return (
    <div className="relative mt-52 flex items-center justify-center">
      <div className="mx-auto grid w-full! max-w-[1250px] grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-3">
        <FeatureCardInterface />
        <FeatureCardSummaries />
        <FeatureCardSearch />
      </div>
    </div>
  );
}

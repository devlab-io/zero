import { HomeCollabSection } from '@/components/home/sections/home-collab-section';
import { HomeFeatureCards } from '@/components/home/sections/home-feature-cards';
import { HomeReplyMockup } from '@/components/home/sections/home-reply-mockup';
import { HomeApiSection } from '@/components/home/sections/home-api-section';
import { HomeHero } from '@/components/home/sections/home-hero';
import { Navigation } from '../navigation';
import Footer from './footer';

/**
 * Landing Reta (P12) — récit produit réel : vitesse clavier, collaboration
 * d'équipe dans le fil, IA au choix (BYOK/MCP). Sections statiques (le héros
 * reste immédiatement visible), un seul h1, tokens clair/sombre partout.
 */
export default function HomeContent() {
  return (
    <main className="brand-landing relative flex h-full flex-1 flex-col overflow-x-hidden bg-[#F7F7F8] px-2 text-zinc-950 transition-colors duration-200 motion-reduce:transition-none dark:bg-[#0F0F0F] dark:text-white">
      <Navigation />

      <HomeHero />

      <HomeCollabSection />

      <HomeReplyMockup />

      <HomeFeatureCards />

      <HomeApiSection />

      <div className="relative mt-32 flex items-center justify-center md:mt-40">
        <Footer />
      </div>
    </main>
  );
}

import { HomeFeatureCards } from '@/components/home/sections/home-feature-cards';
import { HomeReplyMockup } from '@/components/home/sections/home-reply-mockup';
import { HomeChatSection } from '@/components/home/sections/home-chat-section';
import { HomeApiSection } from '@/components/home/sections/home-api-section';
import { PixelatedBackground } from '@/components/home/pixelated-bg';
import { HomeHero } from '@/components/home/sections/home-hero';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Navigation } from '../navigation';
import Footer from './footer';

export default function HomeContent() {
  return (
    <main className="brand-landing relative flex h-full flex-1 flex-col overflow-x-hidden bg-[#F7F7F8] px-2 text-zinc-950 transition-colors duration-300 dark:bg-[#0F0F0F] dark:text-white">
      <PixelatedBackground
        className="z-1 absolute left-1/2 top-[-40px] h-auto w-screen min-w-[1920px] -translate-x-1/2 object-cover opacity-35 dark:opacity-100"
        style={{
          mixBlendMode: 'screen',
          maskImage: 'linear-gradient(to bottom, black, transparent)',
        }}
      />

      <Navigation />

      <ThemeToggle
        showLabel
        className="fixed right-4 top-6 z-[60] border border-zinc-200 bg-white/90 px-3 shadow-lg backdrop-blur-md hover:bg-white dark:border-white/10 dark:bg-[#1E1E1E]/90 dark:hover:bg-[#272727]"
      />

      <HomeHero />

      <HomeReplyMockup />

      <HomeFeatureCards />

      <HomeApiSection />

      <HomeChatSection />

      <div className="relative mt-52 flex items-center justify-center">
        <Footer />
      </div>
    </main>
  );
}

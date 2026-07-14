import { PixelatedBackground } from '@/components/home/pixelated-bg';
import { HomeChatSection } from '@/components/home/sections/home-chat-section';
import { HomeFeatureCards } from '@/components/home/sections/home-feature-cards';
import { HomeReplyMockup } from '@/components/home/sections/home-reply-mockup';
import { HomeHero } from '@/components/home/sections/home-hero';
import { Navigation } from '../navigation';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import Footer from './footer';

export default function HomeContent() {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme('dark');
  }, [setTheme]);

  return (
    <main className="relative flex h-full flex-1 flex-col overflow-x-hidden bg-[#0F0F0F] px-2">
      <PixelatedBackground
        className="z-1 absolute left-1/2 top-[-40px] h-auto w-screen min-w-[1920px] -translate-x-1/2 object-cover"
        style={{
          mixBlendMode: 'screen',
          maskImage: 'linear-gradient(to bottom, black, transparent)',
        }}
      />

      <Navigation />

      <HomeHero />

      <HomeReplyMockup />

      <HomeFeatureCards />

      <HomeChatSection />

      <div className="relative mt-52 flex items-center justify-center">
        <Footer />
      </div>
    </main>
  );
}

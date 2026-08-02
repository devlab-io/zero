import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const landingFiles = [
  'components/home/HomeContent.tsx',
  'components/home/footer.tsx',
  'components/home/sections/home-hero.tsx',
  'components/home/sections/home-collab-section.tsx',
  'components/home/sections/home-reply-mockup.tsx',
  'components/home/sections/home-feature-cards.tsx',
  'components/home/sections/home-api-section.tsx',
  'components/navigation.tsx',
] as const;

describe('P12/P121 landing quality contract', () => {
  const source = landingFiles.map(read).join('\n');

  it('keeps decorative effects explicitly excluded from the Reta language', () => {
    for (const banned of [
      'backdrop-blur',
      'animate-fade-up',
      'bg-clip-text',
      'text-transparent',
      'PixelatedBackground',
      'PixelatedLeft',
      'PixelatedRight',
    ]) {
      expect(source, `landing must not contain ${banned}`).not.toContain(banned);
    }
  });

  it('does not publish absolute product claims contradicted by the actual surface', () => {
    for (const claim of [
      'never send',
      'draft-only',
      'Nothing to migrate',
      'never waits',
      'never slows',
      'reply in seconds',
      'three keystrokes',
    ]) {
      expect(source.toLowerCase()).not.toContain(claim.toLowerCase());
    }
  });

  it('advertises only collaboration search operators implemented by Reta', () => {
    const features = read('components/home/sections/home-feature-cards.tsx');
    for (const operator of ['is:shared', 'is:assigned', 'has:comment', 'has:mention']) {
      expect(features).toContain(operator);
    }
    expect(features).not.toContain('team and status');
  });

  it('keeps the skip link target valid across every authenticated route', () => {
    const layout = read('app/(routes)/layout.tsx');
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('id="main-content"');
  });

  it('does not depend on confetti for product activation', () => {
    expect(read('package.json')).not.toContain('canvas-confetti');
  });
});

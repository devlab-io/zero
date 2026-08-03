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
    expect(source).not.toContain('assign it to Done');
    expect(source).not.toContain('Move your inbox');
  });

  it('keeps activation consistent and lets the login page explain the provider step', () => {
    const hero = read('components/home/sections/home-hero.tsx');
    const navigation = read('components/navigation.tsx');
    const footer = read('components/home/footer.tsx');
    expect(hero).toContain('<Link to="/login">Get started</Link>');
    expect(navigation).toContain('<Link to="/login">Get started</Link>');
    expect(footer).toContain('<a href="/login">Get started</a>');
    expect(hero + navigation).not.toContain('signIn.social');
  });

  it('keeps one semantic heading per landing narrative beat', () => {
    for (const file of [
      'components/home/sections/home-collab-section.tsx',
      'components/home/sections/home-reply-mockup.tsx',
      'components/home/sections/home-api-section.tsx',
    ]) {
      expect(read(file).match(/<h2\b/g)).toHaveLength(1);
    }

    for (const file of [
      'components/home/sections/home-collab-section.tsx',
      'components/home/sections/home-reply-mockup.tsx',
      'components/home/sections/home-api-section.tsx',
    ]) {
      expect(read(file).match(/<span\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('labels mobile navigation and its icon links', () => {
    const navigation = read('components/navigation.tsx');
    expect(navigation).toContain("aria-label={open ? 'Close navigation' : 'Open navigation'}");
    expect(navigation).toContain('aria-expanded={open}');
    expect(navigation).toContain('aria-controls={mobileNavigationPanelId}');
    expect(navigation).toContain('id={mobileNavigationPanelId}');
    expect(navigation).toContain('size-11 min-h-11 min-w-11');
    expect(navigation).toContain('aria-label={resource.title}');
    expect(navigation).not.toContain('Contact Us');
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

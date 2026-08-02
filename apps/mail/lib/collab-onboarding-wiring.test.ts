import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(appRoot, relative), 'utf8');

describe('P13 collaboration onboarding wiring', () => {
  it('uses the factual Inbox checklist instead of mounting the legacy Zero tour', () => {
    const mailLayout = read('app/(routes)/mail/layout.tsx');
    const dashboard = read('components/mail/inbox-dashboard.tsx');
    const checklist = read('components/team/collab-onboarding.tsx');

    expect(mailLayout).not.toContain('OnboardingWrapper');
    expect(mailLayout).not.toContain('@/components/onboarding');
    expect(dashboard).toContain('<CollabOnboardingCard context="dashboard" />');
    expect(checklist).toContain('teams.onboardingStatus');
    expect(checklist).toContain('teams.setOnboardingDismissed');
    expect(checklist).not.toContain('<video');
    expect(checklist).not.toMatch(/(?:from|import\()\s*['"][^'"]*confetti/i);
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/app-sidebar', () => ({
  AppSidebar: () => <aside aria-label="Application navigation" />,
}));
vi.mock('@/components/onboarding', () => ({ OnboardingWrapper: () => null }));
vi.mock('@/components/queue/queue-review', () => ({
  QueueReview: () => <section aria-label="Draft queue" />,
}));
vi.mock('react-router', () => ({ Outlet: () => <section aria-label="Mailbox" /> }));

import MailLayout from './mail/layout';
import QueuePage from './queue/page';

describe('authenticated route landmarks', () => {
  it.each([
    ['mail', <MailLayout key="mail" />],
    ['queue', <QueuePage key="queue" />],
  ])('gives %s exactly one named content landmark target', (_name, route) => {
    const html = renderToStaticMarkup(route);

    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain('id="main-content"');
    expect(html).not.toContain('<h2></h2>');
  });
});

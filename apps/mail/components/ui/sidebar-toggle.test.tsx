import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ toggleSidebar: vi.fn() }),
}));

import { SidebarToggle } from './sidebar-toggle';

describe('SidebarToggle accessibility', () => {
  it('names the icon-only control for assistive technology', () => {
    const html = renderToStaticMarkup(<SidebarToggle />);

    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Toggle sidebar"');
  });
});

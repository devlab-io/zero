import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarThemeSwitch } from './sidebar-theme-switcher';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  resolvedTheme: 'light' as 'light' | 'dark',
  sidebarState: 'expanded' as 'expanded' | 'collapsed',
  setTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: harness.resolvedTheme, setTheme: harness.setTheme }),
}));

vi.mock('../ui/sidebar', () => ({
  useSidebar: () => ({ state: harness.sidebarState }),
  SidebarMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({
    children,
    tooltip,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { tooltip?: string }) => {
    void tooltip;
    return <button {...props}>{children}</button>;
  },
}));

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<SidebarThemeSwitch />));
}

describe('SidebarThemeSwitch', () => {
  beforeEach(() => {
    harness.resolvedTheme = 'light';
    harness.sidebarState = 'expanded';
    harness.setTheme.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows both appearance choices and selects dark mode', () => {
    mount();

    const buttons = [...container.querySelectorAll('button')];
    const light = buttons.find((button) => button.textContent?.includes('Light'))!;
    const dark = buttons.find((button) => button.textContent?.includes('Dark'))!;

    expect(light.getAttribute('aria-pressed')).toBe('true');
    expect(dark.getAttribute('aria-pressed')).toBe('false');

    act(() => dark.click());
    expect(harness.setTheme).toHaveBeenCalledWith('dark');
  });

  it('keeps a one-click toggle when the sidebar is collapsed', () => {
    harness.sidebarState = 'collapsed';
    mount();

    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Switch to dark mode"]',
    )!;
    act(() => toggle.click());
    expect(harness.setTheme).toHaveBeenCalledWith('dark');
  });
});

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar';
import { MoonIcon } from '../icons/animated/moon';
import { SunIcon } from '../icons/animated/sun';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export function SidebarThemeSwitch() {
  const [isRendered, setIsRendered] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const { state } = useSidebar();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => setIsRendered(true), []);

  async function setAppearance(nextTheme: 'light' | 'dark') {
    if (nextTheme === resolvedTheme) return;

    const update = () => setTheme(nextTheme);
    if (document.startViewTransition) {
      document.documentElement.style.viewTransitionName = 'theme-transition';
      await document.startViewTransition(update).finished;
      document.documentElement.style.viewTransitionName = '';
    } else {
      update();
    }
  }

  if (!isRendered) return null;

  if (state === 'collapsed') {
    const targetTheme = isDark ? 'light' : 'dark';
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            type="button"
            tooltip={`Switch to ${targetTheme} mode`}
            aria-label={`Switch to ${targetTheme} mode`}
            onClick={() => void setAppearance(targetTheme)}
          >
            {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <div
      className="bg-muted/60 grid grid-cols-2 gap-1 rounded-lg p-1"
      role="group"
      aria-label="Appearance"
    >
      <button
        type="button"
        aria-pressed={!isDark}
        onClick={() => void setAppearance('light')}
        className={cn(
          'text-muted-foreground flex h-8 items-center justify-center gap-2 rounded-md text-xs font-medium transition-colors',
          !isDark && 'bg-background text-foreground shadow-sm',
        )}
      >
        <SunIcon className="size-3.5" />
        Light
      </button>
      <button
        type="button"
        aria-pressed={isDark}
        onClick={() => void setAppearance('dark')}
        className={cn(
          'text-muted-foreground flex h-8 items-center justify-center gap-2 rounded-md text-xs font-medium transition-colors',
          isDark && 'bg-background text-foreground shadow-sm',
        )}
      >
        <MoonIcon className="size-3.5" />
        Dark
      </button>
    </div>
  );
}

import type { ComponentProps } from 'react';

import { type SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { PanelLeftOpen } from '../icons/icons';
import { m } from '@/paraglide/messages';
import { cn } from '@/lib/utils';

export function SidebarToggle({ className }: ComponentProps<typeof SidebarTrigger>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      aria-label={m['pages.settings.shortcuts.actions.toggleSidebar']()}
      onClick={toggleSidebar}
      variant="ghost"
      className={cn('h-10 w-10 md:px-2', className)}
    >
      <PanelLeftOpen className="dark:fill-iconDark fill-iconLight" />
    </Button>
  );
}

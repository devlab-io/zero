import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
// import { useMutation } from '@tanstack/react-query';
import { ComposeSurface, preloadComposeSurface } from '../create/compose-surface';
import { SidebarThemeSwitch } from '@/components/theme/sidebar-theme-switcher';
import { navigationConfig, bottomNavItems } from '@/config/navigation';
import { AskRetaButton } from '@/components/copilot/ask-reta-button';
import { useMailboxOverview } from '@/hooks/use-mailbox-overview';
import { preloadThreadReader } from '../mail/mail-lazy-surfaces';
import React, { useEffect, useMemo, useState } from 'react';
import { useSidebar } from '@/components/ui/sidebar';
import { PencilCompose, X } from '../icons/icons';
import { useBilling } from '@/hooks/use-billing';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { useLocation } from 'react-router';
import { m } from '@/paraglide/messages';
// import { Video } from 'lucide-react';
import { NavUser } from './nav-user';
import { NavMain } from './nav-main';
import { useQueryState } from 'nuqs';
import { cn } from '@/lib/utils';
// import { toast } from 'sonner';

// #44 (gate A8): the compose surface (CreateEmail, which statically pulled posthog-js) is
// dynamic-imported via ComposeSurface (mail-lazy-surfaces) and only rendered inside the compose
// DialogContent, which Radix mounts when the dialog opens. Warmed by user intent (hover/focus of
// the compose button) and, since CUA 2026-07-30, once on post-boot idle: the `c` hotkey carries no
// hover intent and paid the cold waterfall as a 0.84 s spinner. Runtime prefetch only — the static
// graph (chunk composition) is untouched. create-email is unchanged.
const preloadCompose = preloadComposeSurface;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isPro, isLoading } = useBilling();
  //   const trpc = useTRPC();
  //   const { mutateAsync: createMeet } = useMutation(trpc.meet.create.mutationOptions());
  const [showUpgrade, setShowUpgrade] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('hideUpgradeCard') !== 'true';
    }
    return true;
  });
  const { data: mailboxOverview } = useMailboxOverview();
  // CUA 2026-07-30: warm the compose waterfall once the boot path is idle, so the `c`
  // hotkey (no hover intent) opens without the Suspense spinner. Idle-time prefetch only.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // CUA 2026-07-31 : le reader (thread-display) est aussi réchauffé — son
    // chunk lazy portait le shell optimiste d'ouverture, inerte au premier fil
    // de la session sans ce warm.
    const warm = () => {
      preloadComposeSurface();
      preloadThreadReader();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timerId = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(timerId);
  }, []);
  const location = useLocation();
  const { data: session } = useSession();
  const { currentSection, navItems } = useMemo(() => {
    // Find which section we're in based on the pathname
    const section = Object.entries(navigationConfig).find(([, config]) =>
      location.pathname.startsWith(config.path),
    );

    const currentSection = section?.[0] || 'mail';
    if (navigationConfig[currentSection]) {
      const items = navigationConfig[currentSection].sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({ ...item })),
      }));

      if (currentSection === 'mail' && mailboxOverview) {
        const counts = mailboxOverview.folders;
        for (const item of items.flatMap((section) => section.items)) {
          if (item.id && item.id in counts) {
            item.badge = counts[item.id as keyof typeof counts];
          }
        }
      }

      return { currentSection, navItems: items };
    } else {
      return {
        currentSection: '',
        navItems: [],
      };
    }
  }, [location.pathname, mailboxOverview]);

  const showComposeButton = currentSection === 'mail';
  const { state } = useSidebar();

  //   const handleCreateMeet = async () => {
  //     try {
  //       const {
  //         data: { id },
  //       } = await createMeet();
  //       navigator.clipboard.writeText(`https://meet.0.email/${id}`);
  //       toast.success('Meeting linked copied to clipboard');
  //     } catch (error) {
  //       toast.error('Failed to create meeting');
  //     }
  //   };

  // r8b : le vestige plein-écran IA (use-ai-sidebar) est retiré — la sidebar
  // n'a plus d'état IA qui puisse la masquer.
  return (
    <div>
      <Sidebar
        collapsible="icon"
        {...props}
        className={`bg-sidebar dark:bg-sidebar flex h-screen select-none flex-col items-center ${state === 'collapsed' ? '' : ''} pb-2`}
      >
        <SidebarHeader
          className={`relative top-2.5 flex flex-col gap-2 ${state === 'collapsed' ? 'px-2' : 'md:px-4'}`}
        >
          {session && <NavUser />}

          {showComposeButton && (
            <div className="flex flex-col gap-0">
              <div className={cn('w-full')}>
                <ComposeButton />
              </div>
              {/* Ask Reta (r9): the one sanctioned assistant entry, strictly
                  user-invoked — spec docs/spec/mail-copilot.md. */}
              <div className={cn('w-full')}>
                <AskRetaButton />
              </div>
              {/* {isPro ? (
                  <button
                    onClick={handleCreateMeet}
                    className="hover:bg-muted-foreground/10 inline-flex h-8 w-[20%] items-center justify-center gap-1 overflow-hidden rounded-lg border bg-white px-1.5 dark:border-none dark:bg-[#313131]"
                  >
                    <Video className="text-muted-foreground h-4 w-4" />
                  </button>
                ) : null} */}
            </div>
          )}
        </SidebarHeader>
        <SidebarContent
          className={`scrollbar scrollbar-w-1 scrollbar-thumb-accent/40 scrollbar-track-transparent hover:scrollbar-thumb-accent scrollbar-thumb-rounded-full overflow-x-hidden py-0 pt-0 ${state !== 'collapsed' ? 'mt-5 md:px-4' : 'px-2'}`}
        >
          <div className="flex-1 py-0">
            <NavMain items={navItems} />
          </div>
        </SidebarContent>

        {!isLoading && !isPro && showUpgrade && state !== 'collapsed' && (
          <div className="relative top-3 mx-3 mb-4 rounded-lg border bg-white px-4 py-4 backdrop-blur-sm dark:bg-[#1C1C1C]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-6 w-6 rounded-full hover:bg-white/10 [&>svg]:h-2.5 [&>svg]:w-2.5"
              onClick={() => {
                setShowUpgrade(false);
                localStorage.setItem('hideUpgradeCard', 'true');
              }}
            >
              <X className="h-2.5 w-2.5 fill-black dark:fill-white/50" />
            </Button>
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-black dark:text-white/90">
                    Get Reta Pro
                  </h3>
                </div>
                {/* Contrat r8 : promo sans promesse IA — ZERO n'expose aucune IA. */}
                <p className="text-[13px] leading-snug text-black dark:text-white/50">
                  Get more storage, priority support, and more.
                </p>
              </div>
            </div>
            <PricingTrialButton />
          </div>
        )}

        <SidebarFooter className={`px-0 pb-0 ${state === 'collapsed' ? 'md:px-2' : 'md:px-4'}`}>
          <SidebarThemeSwitch />
          <NavMain items={bottomNavItems} />
        </SidebarFooter>
      </Sidebar>
    </div>
  );
}

// #44 (gate A8): the pricing trigger, extracted as a real, exported component so it can be tested
// driving useQueryState('pricingDialog') → 'true'. Behaviour unchanged (same button, same setter).
export function PricingTrialButton() {
  const [, setPricingDialog] = useQueryState('pricingDialog');
  return (
    <button
      onClick={() => setPricingDialog('true')}
      className="mt-3 inline-flex h-7 w-full items-center justify-center gap-0.5 overflow-hidden rounded-lg bg-[#8B5CF6] px-2"
    >
      <div className="flex items-center justify-center gap-2.5 px-0.5">
        <div className="justify-start whitespace-nowrap text-xs leading-none text-white md:text-sm">
          Start 7 day free trial
        </div>
      </div>
    </button>
  );
}

export function ComposeButton() {
  const { state } = useSidebar();
  const isMobile = useIsMobile();

  const [dialogOpen, setDialogOpen] = useQueryState('isComposeOpen');
  const [, setDraftId] = useQueryState('draftId');
  const [, setTo] = useQueryState('to');
  const [, setActiveReplyId] = useQueryState('activeReplyId');
  const [, setMode] = useQueryState('mode');

  const handleOpenChange = async (open: boolean) => {
    if (!open) {
      setDialogOpen(null);
    } else {
      setDialogOpen('true');
    }
    setDraftId(null);
    setTo(null);
    setActiveReplyId(null);
    setMode(null);
  };
  return (
    <Dialog open={!!dialogOpen} onOpenChange={handleOpenChange}>
      <DialogTitle></DialogTitle>
      <DialogDescription></DialogDescription>

      <DialogTrigger asChild>
        {/* #44 (gate A8): warm the lazy compose chunk on explicit user intent (hover/focus),
            never on mount. */}
        <button
          type="button"
          onPointerEnter={preloadCompose}
          onFocus={preloadCompose}
          className="relative mb-1.5 inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1 self-stretch overflow-hidden rounded-lg border border-gray-200 bg-[#006FFE] text-black transition-colors hover:bg-[#0056CC] dark:border-none dark:text-white dark:hover:bg-[#0056CC]"
        >
          {state === 'collapsed' && !isMobile ? (
            <PencilCompose className="mt-0.5 fill-white text-black" />
          ) : (
            <div className="flex items-center justify-center gap-2.5 pl-0.5 pr-1">
              <PencilCompose className="fill-white" />
              <div className="justify-start text-sm leading-none text-white">
                {m['common.commandPalette.commands.newEmail']()}
              </div>
            </div>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="h-screen w-screen max-w-none border-none bg-[#FAFAFA] p-0 shadow-none dark:bg-[#141414]">
        <ComposeSurface />
      </DialogContent>
    </Dialog>
  );
}

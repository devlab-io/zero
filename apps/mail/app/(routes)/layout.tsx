import { DeferredGlobalWorkspaceDock } from '@/components/workspace/global-workspace-dock.deferred';
import { GlobalWorkspaceProvider } from '@/components/workspace/global-workspace-context';
import { HotkeyProviderWrapper } from '@/components/providers/hotkey-provider-wrapper';
import { CommandPaletteProvider } from '@/components/context/command-palette-context';
import { AskRetaWorkspace } from '@/components/copilot/ask-reta-workspace';
import { SidebarProvider } from '@/components/context/sidebar-context';
import { LoadingProvider } from '@/components/context/loading-context';
import { QueryProvider } from '@/providers/query-provider';
import { Provider as JotaiProvider } from 'jotai';
import { m } from '@/paraglide/messages';
import { Outlet } from 'react-router';

// w2cd (client weight): app-only providers (React Query/tRPC, jotai, sidebar,
// loading state) live here instead of the root so the public shell
// (__spa-fallback, landing, login, full-width pages) doesn't ship their code.
// The nesting mirrors what the root providers used to enforce.
export default function Layout() {
  return (
    <QueryProvider>
      <JotaiProvider>
        <SidebarProvider>
          <LoadingProvider>
            <CommandPaletteProvider>
              <HotkeyProviderWrapper>
                {/* CUA P1 (focus initial) : premier focusable du shell — sans lui,
                    le premier Tab atterrit sur le mini contrôle de compte de la
                    sidebar. Visible uniquement au focus clavier. */}
                <a
                  href="#main-content"
                  className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:bg-[#1E1E1E]"
                >
                  {m['common.actions.skipToContent']()}
                </a>
                <GlobalWorkspaceProvider>
                  <div
                    id="reta-app-shell"
                    className="relative flex max-h-screen w-full overflow-hidden"
                  >
                    <div
                      id="main-content"
                      tabIndex={-1}
                      className="relative flex min-w-0 flex-1 overflow-hidden focus:outline-none"
                    >
                      <Outlet />
                    </div>
                    <DeferredGlobalWorkspaceDock />
                  </div>
                </GlobalWorkspaceProvider>
                <AskRetaWorkspace />
              </HotkeyProviderWrapper>
            </CommandPaletteProvider>
          </LoadingProvider>
        </SidebarProvider>
      </JotaiProvider>
    </QueryProvider>
  );
}

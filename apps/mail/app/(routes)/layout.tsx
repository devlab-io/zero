import { DeferredGlobalWorkspaceDock } from '@/components/workspace/global-workspace-dock.deferred';
import { HotkeyProviderWrapper } from '@/components/providers/hotkey-provider-wrapper';
import { CommandPaletteProvider } from '@/components/context/command-palette-context';
import { AskRetaWorkspace } from '@/components/copilot/ask-reta-workspace';
import { SidebarProvider } from '@/components/context/sidebar-context';
import { LoadingProvider } from '@/components/context/loading-context';
import { QueryProvider } from '@/providers/query-provider';
import { Provider as JotaiProvider } from 'jotai';
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
                <div
                  id="reta-app-shell"
                  className="relative flex max-h-screen w-full overflow-hidden"
                >
                  <Outlet />
                  <DeferredGlobalWorkspaceDock />
                </div>
                <AskRetaWorkspace />
              </HotkeyProviderWrapper>
            </CommandPaletteProvider>
          </LoadingProvider>
        </SidebarProvider>
      </JotaiProvider>
    </QueryProvider>
  );
}

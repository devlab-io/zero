import { useState, useEffect, useCallback } from 'react';
import { useQueryState } from 'nuqs';

// Extracted verbatim from ai-sidebar.tsx so consumers of these lightweight state hooks
// (app-sidebar, thread-display, mail, ai-toggle-button, …) do not statically pull the
// heavy AI sidebar bundle (livekit/elevenlabs/agents) into the initial chunk. The
// AISidebar component itself is loaded lazily at its render site.

type ViewMode = 'sidebar' | 'popup' | 'fullscreen';

export function useAIFullScreen() {
  const [isFullScreenQuery, setIsFullScreenQuery] = useQueryState('isFullScreen');

  // Initialize isFullScreen state from query parameter or localStorage
  const [isFullScreen, setIsFullScreenState] = useState<boolean>(() => {
    // First check query parameter
    if (isFullScreenQuery) {
      return isFullScreenQuery === 'true';
    }

    // Then check localStorage if on client
    if (typeof window !== 'undefined') {
      const savedFullScreen = localStorage.getItem('ai-fullscreen');
      if (savedFullScreen) {
        return savedFullScreen === 'true';
      }
    }

    return false;
  });

  // Update both query parameter and localStorage when fullscreen state changes
  const setIsFullScreen = useCallback(
    (value: boolean) => {
      // Immediately update local state for faster UI response
      setIsFullScreenState(value);

      // For exiting fullscreen, we need to be extra careful to ensure state is updated properly
      if (!value) {
        // Force immediate removal from localStorage for faster response
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ai-fullscreen');
        }

        // Use setTimeout to ensure the state update happens in the next tick
        // This helps prevent the need for double-clicking
        setTimeout(() => {
          setIsFullScreenQuery(null).catch(console.error);
        }, 0);
      } else {
        // For entering fullscreen, we can use the normal flow
        setIsFullScreenQuery('true').catch(console.error);

        // Save to localStorage for persistence across sessions
        if (typeof window !== 'undefined') {
          localStorage.setItem('ai-fullscreen', 'true');
        }
      }
    },
    [setIsFullScreenQuery],
  );

  // Sync with query parameter on mount or when it changes
  useEffect(() => {
    const queryValue = isFullScreenQuery === 'true';
    if (isFullScreenQuery !== null && queryValue !== isFullScreen) {
      setIsFullScreenState(queryValue);
    }
  }, [isFullScreenQuery, isFullScreen]);

  // Initialize from localStorage on mount if query parameter is not set
  useEffect(() => {
    if (typeof window !== 'undefined' && !isFullScreenQuery) {
      const savedFullScreen = localStorage.getItem('ai-fullscreen');
      if (savedFullScreen === 'true') {
        setIsFullScreenQuery('true');
      }
    }

    // Force a re-render when exiting fullscreen mode
    if (isFullScreenQuery === null && isFullScreen) {
      setIsFullScreenState(false);
    }
  }, [isFullScreenQuery, setIsFullScreenQuery, isFullScreen]);

  return {
    isFullScreen,
    setIsFullScreen,
  };
}

export function useAISidebar() {
  const [open, setOpenQuery] = useQueryState('aiSidebar');
  const [viewModeQuery, setViewModeQuery] = useQueryState('viewMode');
  const { isFullScreen, setIsFullScreen } = useAIFullScreen();

  // Initialize viewMode from query parameter, localStorage, or default to 'sidebar'
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (viewModeQuery) return viewModeQuery as ViewMode;

    // Check localStorage for saved state if on client
    if (typeof window !== 'undefined') {
      const savedViewMode = localStorage.getItem('ai-viewmode');
      if (savedViewMode && (savedViewMode === 'sidebar' || savedViewMode === 'popup')) {
        return savedViewMode as ViewMode;
      }
    }

    return 'popup';
  });

  // Update query parameter and localStorage when viewMode changes
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      setViewModeQuery(mode === 'popup' ? null : mode);

      // Save to localStorage for persistence across sessions
      if (typeof window !== 'undefined') {
        localStorage.setItem('ai-viewmode', mode);
      }
    },
    [setViewModeQuery],
  );

  const setOpen = useCallback(
    (openState: boolean) => {
      if (!openState) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ai-sidebar-open');
        }
        setTimeout(() => {
          setOpenQuery(null).catch(console.error);
        }, 0);
      } else {
        setOpenQuery('true').catch(console.error);
        if (typeof window !== 'undefined') {
          localStorage.setItem('ai-sidebar-open', 'true');
        }
      }
    },
    [setOpenQuery],
  );

  const toggleOpen = useCallback(() => setOpen(open !== 'true'), [open, setOpen]);

  useEffect(() => {
    if (viewModeQuery && viewModeQuery !== viewMode) {
      setViewModeState(viewModeQuery as ViewMode);
    }
  }, [viewModeQuery, viewMode]);

  return {
    open: !!open,
    viewMode,
    setViewMode,
    setOpen,
    toggleOpen,
    toggleViewMode: () => setViewMode(viewMode === 'popup' ? 'sidebar' : 'popup'),
    isFullScreen,
    setIsFullScreen,
    // Add convenience boolean flags for each state
    isSidebar: viewMode === 'sidebar',
    isPopup: viewMode === 'popup',
  };
}

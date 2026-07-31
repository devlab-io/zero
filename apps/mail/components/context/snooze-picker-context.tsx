import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { SnoozeDialog } from '@/components/mail/snooze-dialog';

type SnoozeRequest = {
  threadIds: string[];
  folder: string;
  afterConfirm?: () => void;
};

type SnoozePickerContextValue = {
  openSnoozePicker: (request: SnoozeRequest) => void;
};

const SnoozePickerContext = createContext<SnoozePickerContextValue | null>(null);

export function SnoozePickerProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<SnoozeRequest | null>(null);
  const { optimisticSnooze } = useOptimisticActions();

  const openSnoozePicker = useCallback((nextRequest: SnoozeRequest) => {
    if (!nextRequest.threadIds.length) return;
    setRequest(nextRequest);
  }, []);

  const handleConfirm = useCallback(
    (wakeAt: Date) => {
      if (!request) return;
      optimisticSnooze(request.threadIds, request.folder, wakeAt);
      request.afterConfirm?.();
      setRequest(null);
    },
    [optimisticSnooze, request],
  );

  const value = useMemo(() => ({ openSnoozePicker }), [openSnoozePicker]);

  return (
    <SnoozePickerContext.Provider value={value}>
      {children}
      <SnoozeDialog
        open={request !== null}
        onOpenChange={(open) => {
          if (!open) setRequest(null);
        }}
        onConfirm={handleConfirm}
      />
    </SnoozePickerContext.Provider>
  );
}

export function useSnoozePicker() {
  const context = useContext(SnoozePickerContext);
  if (!context) throw new Error('useSnoozePicker must be used within SnoozePickerProvider');
  return context;
}

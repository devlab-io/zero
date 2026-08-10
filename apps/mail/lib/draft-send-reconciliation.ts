import { pruneThreadFromListPages } from '@/lib/prune-thread-cache';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

const DRAFT_SENT_CHANNEL = 'reta-draft-sent-v1';
let draftSentPublisher: BroadcastChannel | null = null;

export type DraftSentEvent = {
  type: 'draft-sent';
  connectionId: string;
  draftId: string;
};

/** Remove the provider draft immediately while the authoritative refetch runs. */
export function pruneSentDraftFromCache(
  queryClient: QueryClient,
  draftListQueryKey: QueryKey,
  draftId: string,
) {
  queryClient.setQueriesData(
    { queryKey: draftListQueryKey },
    (data: Parameters<typeof pruneThreadFromListPages>[0]) =>
      pruneThreadFromListPages(data, draftId),
  );
}

/** Notify every other open RETA tab; the sending tab reconciles locally first. */
export function publishDraftSent(event: DraftSentEvent) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    draftSentPublisher ??= new BroadcastChannel(DRAFT_SENT_CHANNEL);
    draftSentPublisher.postMessage(event);
  } catch {
    // The local cache was already reconciled. A blocked channel only means
    // other tabs will fall back to their authoritative focus refetch.
  }
}

export function subscribeToDraftSent(listener: (event: DraftSentEvent) => void) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(DRAFT_SENT_CHANNEL);
  } catch {
    return () => {};
  }
  channel.addEventListener('message', (message: MessageEvent<unknown>) => {
    const event = message.data as Partial<DraftSentEvent> | null;
    if (
      event?.type === 'draft-sent' &&
      typeof event.connectionId === 'string' &&
      typeof event.draftId === 'string'
    ) {
      listener(event as DraftSentEvent);
    }
  });
  return () => channel.close();
}

import { Mic, MicOff, Loader2, WavesIcon } from 'lucide-react';
import { useVoice } from '@/providers/voice-provider';

import { useSession } from '@/lib/auth-client';
import { useQueryState } from 'nuqs';

export function VoiceButton() {
  const { data: session } = useSession();
  const [threadId] = useQueryState('threadId');

  const { status, isInitializing, isSpeaking, startConversation, endConversation } = useVoice();

  const isConnected = status === 'connected';

  const handleStartConversation = async () => {
    const context = {
      hasOpenEmail: !!threadId,
      currentThreadId: threadId || null,
    };

    await startConversation(context);
  };

  if (!session) {
    return null;
  }

  if (!isConnected) {
    // w2cd (client weight): motion.div scale-in replaced by tailwindcss-animate. The
    // former `exit` was inert (no AnimatePresence wrapper), so nothing is lost.
    return (
      <div className="animate-in zoom-in duration-200">
        <button type="button" onClick={handleStartConversation} className="cursor-pointer">
          <div className="dark:bg[#141414] flex h-7 items-center justify-center rounded-sm bg-[#262626] px-2">
            <Mic className="h-4 w-4 text-white dark:text-[#929292]" />
          </div>
        </button>
      </div>
    );
  }

  return (
    isConnected && (
      <button type="button" onClick={endConversation} className="cursor-pointer">
        <div className="dark:bg[#141414] flex h-7 items-center justify-center rounded-sm bg-[#262626] px-2">
          {isInitializing && (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {!isInitializing &&
            (isSpeaking ? (
              <WavesIcon className="h-4 w-4 text-white dark:text-[#929292]" />
            ) : (
              <MicOff className="h-4 w-4 text-white dark:text-[#929292]" />
            ))}
        </div>
      </button>
    )
  );
}

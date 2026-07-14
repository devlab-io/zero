import { log } from '@/lib/log';
import useBackgroundQueue from '@/hooks/ui/use-background-queue';
import { useMail } from '@/components/mail/use-mail';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useThreads } from '@/hooks/use-threads';
import { m } from '@/paraglide/messages';
import { useState } from 'react';
import { toast } from 'sonner';

const useDelete = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [mail, setMail] = useMail();
  const [{ refetch: refetchThreads }] = useThreads();
  const { addToQueue, } = useBackgroundQueue();
  const trpc = useTRPC();
  const { mutateAsync: deleteThread } = useMutation(trpc.mail.delete.mutationOptions());

  return {
    mutate: (id: string, type: 'thread' | 'email' = 'thread') => {
      setIsLoading(true);
      addToQueue(id);
      return toast.promise(
        deleteThread({
          id,
        }),
        {
          loading: m['common.actions.deletingMail'](),
          success: m['common.actions.deletedMail'](),
          error: (error) => {
            log.error(`Error deleting ${type}:`, error);

            return m['common.actions.failedToDeleteMail']();
          },
          finally: async () => {
            setMail({
              ...mail,
              bulkSelected: [],
            });
            setIsLoading(false);
            await refetchThreads();
          },
        },
      );
    },
    isLoading,
  };
};

export default useDelete;

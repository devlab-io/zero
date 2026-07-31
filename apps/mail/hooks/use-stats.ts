import { useDoState } from '@/components/mail/use-do-state';
import { useActiveConnection } from './use-connections';

export const useStats = () => {
  const [doState] = useDoState();
  const { data: activeConnection } = useActiveConnection();
  return {
    data:
      activeConnection?.id && doState.connectionId === activeConnection.id
        ? doState.counts
        : undefined,
  };
};

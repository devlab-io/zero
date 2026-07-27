import { useAutumn, useCustomer } from 'autumn-js/react';
import { isProCustomer } from '@/lib/utils';
import { useEffect, useMemo } from 'react';
import { log } from '@/lib/log';

type FeatureState = {
  total: number;
  remaining: number;
  unlimited: boolean;
  enabled: boolean;
  usage: number;
  nextResetAt: number | null;
  interval: string;
  included_usage: number;
};

type Features = {
  chatMessages: FeatureState;
  connections: FeatureState;
  brainActivity: FeatureState;
};

const DEFAULT_FEATURES: Features = {
  chatMessages: {
    total: 0,
    remaining: 0,
    unlimited: false,
    enabled: false,
    usage: 0,
    nextResetAt: null,
    interval: '',
    included_usage: 0,
  },
  connections: {
    total: 0,
    remaining: 0,
    unlimited: false,
    enabled: false,
    usage: 0,
    nextResetAt: null,
    interval: '',
    included_usage: 0,
  },
  brainActivity: {
    total: 0,
    remaining: 0,
    unlimited: false,
    enabled: false,
    usage: 0,
    nextResetAt: null,
    interval: '',
    included_usage: 0,
  },
};

const FEATURE_IDS = {
  CHAT: 'chat-messages',
  CONNECTIONS: 'connections',
  BRAIN: 'brain-activity',
} as const;

export const useBilling = () => {
  const { customer, refetch, isLoading, error } = useCustomer();
  const { attach, track, openBillingPortal } = useAutumn();

  // Devlab (robustesse) : un échec de l'API de facturation ne doit PAS
  // déconnecter. Ce `signOut()` transformait n'importe quel hoquet d'Autumn —
  // ou un simple appel parti avant que la session ne soit établie — en
  // déconnexion complète de l'utilisateur. On journalise et on retombe sur
  // DEFAULT_FEATURES ; l'authentification reste gérée par la couche tRPC.
  useEffect(() => {
    if (error) log.error('[useBilling] Échec de récupération du client Autumn', error);
  }, [error]);

  const { isPro, ...customerFeatures } = useMemo(() => {
    const isPro = customer ? isProCustomer(customer) : false;

    if (!customer?.features) return { isPro, ...DEFAULT_FEATURES };

    const features = { ...DEFAULT_FEATURES };

    if (customer.features[FEATURE_IDS.CHAT]) {
      const feature = customer.features[FEATURE_IDS.CHAT];
      features.chatMessages = {
        total: feature.included_usage || 0,
        remaining: feature.balance || 0,
        unlimited: feature.unlimited ?? false,
        enabled: (feature.unlimited ?? false) || Number(feature.balance) > 0,
        usage: feature.usage || 0,
        nextResetAt: feature.next_reset_at ?? null,
        interval: feature.interval || '',
        included_usage: feature.included_usage || 0,
      };
    }

    if (customer.features[FEATURE_IDS.CONNECTIONS]) {
      const feature = customer.features[FEATURE_IDS.CONNECTIONS];
      features.connections = {
        total: feature.included_usage || 0,
        remaining: feature.balance || 0,
        unlimited: feature.unlimited ?? false,
        enabled: (feature.unlimited ?? false) || Number(feature.balance) > 0,
        usage: feature.usage || 0,
        nextResetAt: feature.next_reset_at ?? null,
        interval: feature.interval || '',
        included_usage: feature.included_usage || 0,
      };
    }

    if (customer.features[FEATURE_IDS.BRAIN]) {
      const feature = customer.features[FEATURE_IDS.BRAIN];
      features.brainActivity = {
        total: feature.included_usage || 0,
        remaining: feature.balance || 0,
        unlimited: feature.unlimited ?? false,
        enabled: (feature.unlimited ?? false) || Number(feature.balance) > 0,
        usage: feature.usage || 0,
        nextResetAt: feature.next_reset_at ?? null,
        interval: feature.interval || '',
        included_usage: feature.included_usage || 0,
      };
    }

    return { isPro, ...features };
  }, [customer]);

  return {
    isLoading,
    customer,
    refetch,
    attach,
    track,
    openBillingPortal,
    isPro,
    ...customerFeatures,
  };
};

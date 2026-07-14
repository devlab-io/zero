import { log } from '@/lib/log';
import { useSession } from '@/lib/auth-client';
import { useEffect } from 'react';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;

// w2cd (client weight): PostHog is loaded via a gated dynamic import() so neither
// posthog-js nor posthog-js/react sits in the eager shell bundle on behalf of
// analytics. posthog-js/react (the <PHProvider> React context) is dropped entirely —
// nothing in the app consumes usePostHog(); feature code uses the posthog singleton
// directly. This component owns only init + user identification, and rendering nothing.
//
// With no key configured (the default in this fork) no analytics code loads here at all.
export function PostHogAnalytics() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    void import('posthog-js').then(({ default: posthog }) => {
      try {
        posthog.init(POSTHOG_KEY, {
          api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          capture_pageview: true,
        });
      } catch (error) {
        log.error('Error initializing PostHog:', error);
      }
    });
  }, []);

  useEffect(() => {
    if (!POSTHOG_KEY || !session?.user) return;
    void import('posthog-js').then(({ default: posthog }) => {
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
      });
    });
  }, [session]);

  return null;
}

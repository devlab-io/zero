import HomeContent from '@/components/home/HomeContent';
import { useSession } from '@/lib/auth-client';
import { useNavigate } from 'react-router';
import { useEffect } from 'react';

// #44 (gate A8, landing prerender): the auth-redirect used to live in a `clientLoader`,
// which forced React Router (ssr:false) to prerender only the neutral HydrateFallback into
// index.html — the real landing never reached the static HTML (proven by #33's reversible
// experiment). Moving the redirect to a post-hydration effect makes `/` prerenderable, so
// index.html now carries the real HomeContent (static first paint for logged-out visitors at
// `/`). Logged-in users are still redirected to /mail/inbox — now client-side after hydration
// (a landing frame is shown before the redirect, where before a spinner frame was shown). The
// SPA deep-link fallback is served from the dedicated neutral __spa-fallback.html shell (see
// wrangler.jsonc + workers/spa-fallback.ts), so navigations to deep-links like /mail/inbox are
// not served landing content.
export default function Home() {
  const { data: session } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session?.user?.id) navigate('/mail/inbox', { replace: true });
  }, [session?.user?.id, navigate]);

  return <HomeContent />;
}

import { emailContentQueryKey, resolveEmailContentTheme } from '@/lib/email-content-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { containsCidImage, resolveCidImages } from '@/lib/cid-images';
import { defaultUserSettings } from '@zero/server/schemas';
import { useInlineImages } from '@/hooks/use-attachments';
import { useTRPC } from '@/providers/query-provider';
import { getBrowserTimezone } from '@/lib/timezones';
import { useSettings } from '@/hooks/use-settings';
import { m } from '@/paraglide/messages';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { log } from '@/lib/log';
import { toast } from 'sonner';

interface MailContentProps {
  id: string;
  html: string;
  senderEmail: string;
  /**
   * r15a : posé après que le corps traité a RÉELLEMENT été injecté dans le
   * shadow DOM et qu'un frame a été présenté (double rAF) — c'est le jalon
   * `thread:content-painted`, comparable au « corps visible » de Shortwave.
   */
  onContentPainted?: () => void;
}

export function MailContent({ id, html, senderEmail, onContentPainted }: MailContentProps) {
  const { data, refetch } = useSettings();
  const queryClient = useQueryClient();
  const isTrustedSender = useMemo(
    () => data?.settings?.externalImages || data?.settings?.trustedSenders?.includes(senderEmail),
    [data?.settings, senderEmail],
  );
  const [cspViolation, setCspViolation] = useState(false);
  const [temporaryImagesEnabled, setTemporaryImagesEnabled] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const { resolvedTheme } = useTheme();
  const trpc = useTRPC();

  const { mutateAsync: saveUserSettings } = useMutation({
    ...trpc.settings.save.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const { mutateAsync: trustSender } = useMutation({
    mutationFn: async () => {
      const existingSettings = data?.settings ?? {
        ...defaultUserSettings,
        timezone: getBrowserTimezone(),
      };

      const { success } = await saveUserSettings({
        ...existingSettings,
        trustedSenders: data?.settings?.trustedSenders
          ? data.settings.trustedSenders.concat(senderEmail)
          : [senderEmail],
      });

      if (!success) {
        throw new Error('Failed to trust sender');
      }
    },
    onSuccess: () => {
      refetch();
    },
    onError: () => {
      toast.error(m['common.mail.failedToTrustSender']());
    },
  });

  const { mutateAsync: processEmailContent } = useMutation(
    trpc.mail.processEmailContent.mutationOptions(),
  );

  const allowRemoteImages = Boolean(isTrustedSender || temporaryImagesEnabled);
  const emailTheme = resolveEmailContentTheme(resolvedTheme);
  const { data: processedData } = useQuery({
    queryKey: emailContentQueryKey(id, allowRemoteImages, emailTheme),
    queryFn: async () => {
      const result = await processEmailContent({
        html,
        shouldLoadImages: allowRemoteImages,
        theme: emailTheme,
      });

      return {
        html: result.processedHtml,
        hasBlockedImages: result.hasBlockedImages,
      };
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (processedData) {
      if (processedData.hasBlockedImages) {
        setCspViolation(true);
      }
    }
  }, [processedData]);

  useEffect(() => {
    if (!hostRef.current || shadowRootRef.current) return;

    shadowRootRef.current = hostRef.current.attachShadow({ mode: 'open' });
  }, []);

  // La ref évite qu'un changement d'identité du callback (nouveau fil actif)
  // ne re-déclenche l'injection : l'effet ne dépend QUE de processedData et
  // l'injection elle-même est inchangée (aucune transformation du HTML).
  const onContentPaintedRef = useRef(onContentPainted);
  onContentPaintedRef.current = onContentPainted;

  useEffect(() => {
    if (!shadowRootRef.current || !processedData) return;

    shadowRootRef.current.innerHTML = processedData.html;

    if (!onContentPaintedRef.current) return;
    // Double rAF : le 1er court avant la présentation du frame, le 2e garantit
    // qu'un frame contenant le corps injecté a été présenté. Sans rAF (tests,
    // environnements headless) : signal immédiat. La dédupe une-fois-par-fil
    // vit chez l'appelant (thread-display, markThreadStageOnce).
    if (typeof requestAnimationFrame !== 'function') {
      onContentPaintedRef.current?.();
      return;
    }
    let secondFrameId = 0;
    const firstFrameId = requestAnimationFrame(() => {
      secondFrameId = requestAnimationFrame(() => onContentPaintedRef.current?.());
    });
    return () => {
      cancelAnimationFrame(firstFrameId);
      if (secondFrameId) cancelAnimationFrame(secondFrameId);
    };
  }, [processedData]);

  // Résolution lazy des images CID : uniquement si le corps rendu en contient.
  const hasCidImages = useMemo(() => containsCidImage(processedData?.html), [processedData]);
  const { data: inlineImages } = useInlineImages(id, hasCidImages);

  useEffect(() => {
    if (!shadowRootRef.current || !processedData || !inlineImages?.length) return;
    resolveCidImages(shadowRootRef.current, inlineImages);
  }, [processedData, inlineImages]);

  const handleImageError = useCallback(
    (e: Event) => {
      const target = e.target as HTMLImageElement;
      if (target.tagName === 'IMG') {
        // Une ref `cid:` en attente de résolution n'est pas une image distante
        // bloquée : on la masque le temps du fetch inline, sans lever le bandeau.
        const isPendingCid = (target.getAttribute('src') ?? '').startsWith('cid:');
        if (!isPendingCid && !(isTrustedSender || temporaryImagesEnabled)) {
          setCspViolation(true);
        }
        target.style.display = 'none';
      }
    },
    [isTrustedSender, temporaryImagesEnabled],
  );

  useEffect(() => {
    if (!shadowRootRef.current) return;

    const root = shadowRootRef.current;

    // Add event listeners for image errors and link clicks
    root.addEventListener('error', handleImageError, true);

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A') {
        e.preventDefault();
        const href = target.getAttribute('href');
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          window.open(href, '_blank', 'noopener,noreferrer');
        } else if (href && href.startsWith('mailto:')) {
          window.location.href = href;
        }
      }
    };

    root.addEventListener('click', handleClick);

    return () => {
      root.removeEventListener('error', handleImageError, true);
      root.removeEventListener('click', handleClick);
    };
  }, [processedData, handleImageError]);

  useEffect(() => {
    if (isTrustedSender || temporaryImagesEnabled) {
      setCspViolation(false);
    }
  }, [isTrustedSender, temporaryImagesEnabled]);

  return (
    <>
      {cspViolation && !isTrustedSender && !data?.settings?.externalImages && (
        <div className="flex items-center justify-start bg-amber-600/20 px-2 py-1 text-sm text-amber-600">
          <p>{m['common.actions.hiddenImagesWarning']()}</p>
          <button
            onClick={() => setTemporaryImagesEnabled(!temporaryImagesEnabled)}
            className="ml-2 cursor-pointer underline"
          >
            {temporaryImagesEnabled
              ? m['common.actions.disableImages']()
              : m['common.actions.showImages']()}
          </button>
          <button
            onClick={async () => {
              try {
                await trustSender();
              } catch (error) {
                log.error('Error trusting sender:', error);
              }
            }}
            className="ml-2 cursor-pointer underline"
          >
            {m['common.actions.trustSender']()}
          </button>
        </div>
      )}
      {/* r17b : AUCUNE classe de couleur de texte sur l'hôte. Les règles du
          document extérieur sur l'élément hôte BATTENT les règles :host du
          shadow (CSS Scoping, déclarations normales) : l'ancienne classe de
          texte blanc du thème sombre faisait hériter du blanc à tout contenu
          sans couleur propre — les emails text/plain (driver : texte + <br>,
          zéro style) devenaient blanc-sur-blanc. Le canevas est la propriété
          du shadow root (:host !important, email-processor). */}
      <div
        ref={hostRef}
        className={cn('mail-content no-scrollbar w-full flex-1 overflow-scroll px-4')}
      />
    </>
  );
}

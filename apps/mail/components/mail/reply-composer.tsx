import { useSharesForThread, useTeamMembers, useTeamRealtime } from '@/hooks/use-teams';
import { deriveReplyRecipients, deriveReplySubject } from './reply-recipients';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ComposerOwnerGate } from '@/components/create/composer-owner-gate';
import { constructReplyBody, constructForwardBody } from '@/lib/utils';
import { useReplyStatePurge } from '@/hooks/use-reply-state-purge';
import { resolveReplyTeamContext } from '@/lib/reply-team-context';
import { useActiveConnection } from '@/hooks/use-connections';
import { useSendStatusWatch } from '@/hooks/use-send-status';
import type { ThreadQuoteRequest } from '@/lib/thread-quote';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { markDraftAbandoned } from '@/lib/abandoned-drafts';
import { interpretSendOutcome } from '@/lib/send-outcome';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useUndoSend } from '@/hooks/use-undo-send';
import { loadGitHubEmojis } from '@/lib/emoji-data';
import { useSettings } from '@/hooks/use-settings';
import { isSendResult } from '@/lib/email-utils';
import { useThread } from '@/hooks/use-threads';
import { useSession } from '@/lib/auth-client';
import { serializeFiles } from '@/lib/schemas';
import { useDraft } from '@/hooks/use-drafts';
import { markStage } from '@/lib/perf-stages';
import { m } from '@/paraglide/messages';
import type { Sender } from '@/types';
import { useQueryState } from 'nuqs';
import posthog from 'posthog-js';
import { log } from '@/lib/log';
import { toast } from 'sonner';

// Loaded lazily: the editor (tiptap/prosemirror) only downloads when the user actually
// opens a reply/forward composer, keeping it out of the initial mail chunk. The emoji
// dataset (static JSON asset) is awaited too so the Emoji extension always initializes
// with the full list (its emoticon input rules are built at editor creation).
const EmailComposer = lazy(() =>
  Promise.all([import('../create/email-composer'), loadGitHubEmojis()]).then(([mod]) => ({
    default: mod.EmailComposer,
  })),
);

interface ReplyComposeProps {
  messageId?: string;
  quoteRequest?: ThreadQuoteRequest | null;
  onQuoteInserted?: (id: string) => void;
}

export default function ReplyCompose({
  messageId,
  quoteRequest,
  onQuoteInserted,
}: ReplyComposeProps) {
  const [mode] = useQueryState('mode');
  const { enableScope, disableScope } = useHotkeysContext();
  const { data: aliases } = useEmailAliases();
  const purgeReplyState = useReplyStatePurge();

  const [draftId] = useQueryState('draftId');
  const [threadId] = useQueryState('threadId');
  const { data: emailData, refetch, latestDraft } = useThread(threadId);
  const { data: draft } = useDraft(draftId ?? null);
  const trpc = useTRPC();
  const { mutateAsync: sendEmail } = useMutation(trpc.mail.send.mutationOptions());
  const { mutateAsync: deleteDraft } = useMutation(trpc.drafts.delete.mutationOptions());
  const { data: activeConnection } = useActiveConnection();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: session } = useSession();
  const { handleUndoSend } = useUndoSend();
  const { watchSendStatus } = useSendStatusWatch();
  // Clé d'idempotence de la soumission en cours : générée au premier clic,
  // réutilisée sur retry après échec (dédup serveur), effacée à l'enqueue confirmé.
  const sendSubmissionKeyRef = useRef<string | null>(null);

  // --- P15 : fil PARTAGÉ — signal « rédige », préflight collision -----------
  const { data: sharesData } = useSharesForThread(threadId);
  // Multi-partage (final) : la protection collision ne tombe JAMAIS. Contexte
  // explicite — un partage : frictionless ; plusieurs : sélecteur compact
  // accessible clavier, défaut déterministe = premier partage (ordre serveur).
  const shares = useMemo(() => sharesData?.shares ?? [], [sharesData]);
  const [selectedShareId, setSelectedShareId] = useState<string | null>(null);
  const { share, requiresSelector } = useMemo(
    () =>
      resolveReplyTeamContext(
        shares.map((row: { id: string; teamId: string; teamName: string }) => ({
          id: row.id,
          teamId: row.teamId,
          teamName: row.teamName,
        })),
        selectedShareId,
      ),
    [shares, selectedShareId],
  );
  const teamRealtime = useTeamRealtime(share?.id ?? null);
  const { data: teamMembersData } = useTeamMembers(share?.teamId ?? null);
  const heartbeat = useMutation(trpc.teams.heartbeat.mutationOptions());
  const heartbeatRef = useRef(heartbeat.mutate);
  heartbeatRef.current = heartbeat.mutate;
  // Baseline de collision : REPLY INTENT SERVEUR émis au montage du composeur
  // pour le partage retenu (mutation teams.createReplyIntent) — aucun
  // timestamp client n'existe dans le contrat d'envoi. Cache par partage :
  // changer de contexte crée l'intent du nouveau partage.
  const createReplyIntent = useMutation(trpc.teams.createReplyIntent.mutationOptions());
  const createReplyIntentRef = useRef(createReplyIntent.mutateAsync);
  createReplyIntentRef.current = createReplyIntent.mutateAsync;
  const replyIntentsRef = useRef(new Map<string, string>());
  const ensureReplyIntent = async (teamThreadId: string): Promise<string> => {
    const cached = replyIntentsRef.current.get(teamThreadId);
    if (cached) return cached;
    const intent = await createReplyIntentRef.current({ teamThreadId });
    replyIntentsRef.current.set(teamThreadId, intent.id);
    return intent.id;
  };
  useEffect(() => {
    if (!share?.id) return;
    // Émission EAGER au montage/changement de contexte : la baseline couvre
    // toute la fenêtre de rédaction. Échec silencieux toléré — l'envoi
    // retentera et refusera de partir sans intent (fail closed serveur).
    void ensureReplyIntent(share.id).catch(() => {});
  }, [share?.id]);
  const [collisionReasons, setCollisionReasons] = useState<
    Array<{ type: string; senderEmail?: string; userId?: string }>
  >([]);
  const pendingOverrideRef = useRef(false);
  const sendReplying = teamRealtime.sendReplying;
  useEffect(() => {
    if (!share?.id) return;
    // Signal « rédige une réponse » : socket + fallback DB — un booléen,
    // jamais de contenu ; coupé à la fermeture du composeur.
    sendReplying(true);
    heartbeatRef.current({ teamThreadId: share.id, typing: false, replying: true });
    const interval = setInterval(() => {
      sendReplying(true);
      heartbeatRef.current({ teamThreadId: share.id, typing: false, replying: true });
    }, 30_000);
    return () => {
      clearInterval(interval);
      // Socket : précis PAR onglet (le DO gère replying par socket — fermer
      // ce composeur ne coupe pas celui d'un autre onglet). Fallback DB : on
      // n'écrit PAS replying:false (une ligne par utilisateur, un autre
      // onglet peut composer encore) — le TTL de 60 s expire seul ; limite
      // libellée : jusqu'à 60 s de signal résiduel en polling pur.
      sendReplying(false);
      heartbeatRef.current({ teamThreadId: share.id, typing: false });
    };
  }, [share?.id, sendReplying]);
  const replyingMemberNames = useMemo(() => {
    const members = teamMembersData?.members ?? [];
    return teamRealtime.replyingUserIds
      .map(
        (userId) =>
          members.find((member: { userId: string; name: string }) => member.userId === userId)
            ?.name ?? null,
      )
      .filter((name): name is string => !!name);
  }, [teamMembersData, teamRealtime.replyingUserIds]);

  // Find the specific message to reply to
  const replyToMessage =
    (messageId && emailData?.messages.find((msg) => msg.id === messageId)) || emailData?.latest;

  // Issue #32 (keyboard-parity): the reply / reply-all recipient + subject
  // defaults are derived from the pure, tested seam (./reply-recipients) and
  // wired into initialTo/initialCc/initialSubject below. This is the fix for the
  // empty «To» field: reply and reply-all now open pre-populated. A concrete
  // draft (a resumed compose) still wins so we never clobber a saved draft.
  const replyDefaults = useMemo(() => {
    if (!replyToMessage || !mode || !activeConnection?.email) {
      return { to: [] as string[], cc: [] as string[], subject: '' };
    }
    const { to, cc } = deriveReplyRecipients({
      mode,
      message: replyToMessage,
      userEmail: activeConnection.email,
    });
    const subject = deriveReplySubject({ mode, subject: replyToMessage.subject });
    return { to, cc, subject };
  }, [activeConnection?.email, mode, replyToMessage]);

  const lastSendDataRef = useRef<Parameters<typeof handleSendEmail>[0] | null>(null);

  const handleSendEmail = async (data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
    attachments: File[];
    scheduleAt?: string;
  }) => {
    if (!replyToMessage || !activeConnection?.email) {
      throw new Error('Cannot send a reply without an active message and account');
    }
    lastSendDataRef.current = data;

    // Le clic Send confirme l'ENQUEUE DURABLE (ligne send_job Postgres +
    // Queue acceptée), jamais l'appel Gmail : fermeture quasi immédiate, issue
    // réelle suivie par watchSendStatus. Sur échec d'enqueue, le composer
    // reste ouvert et la même clé de soumission sert au retry (dédup serveur).
    // Deux invocations même-tick partagent aussi cette clé : pas de double
    // envoi possible sans early return (qui fermerait le composer trop tôt).
    const clientSendId = (sendSubmissionKeyRef.current ??= crypto.randomUUID());
    const sendingToast = toast.loading(m['states.sending']());

    try {
      const userEmail = activeConnection.email.toLowerCase();
      const userName = activeConnection.name || session?.user?.name || '';

      let fromEmail = userEmail;

      if (aliases && aliases.length > 0 && replyToMessage) {
        const allRecipients = [
          ...(replyToMessage.to || []),
          ...(replyToMessage.cc || []),
          ...(replyToMessage.bcc || []),
        ];
        const matchingAlias = aliases.find((alias) =>
          allRecipients.some(
            (recipient) => recipient.email.toLowerCase() === alias.email.toLowerCase(),
          ),
        );

        if (matchingAlias) {
          fromEmail = userName.trim()
            ? `${userName.replace(/[<>]/g, '')} <${matchingAlias.email}>`
            : matchingAlias.email;
        } else {
          const primaryEmail =
            aliases.find((alias) => alias.primary)?.email || aliases[0]?.email || userEmail;
          fromEmail = userName.trim()
            ? `${userName.replace(/[<>]/g, '')} <${primaryEmail}>`
            : primaryEmail;
        }
      }

      const toRecipients: Sender[] = data.to.map((email) => ({
        email,
        name: email.split('@')[0] || 'User',
      }));

      const ccRecipients: Sender[] | undefined = data.cc
        ? data.cc.map((email) => ({
            email,
            name: email.split('@')[0] || 'User',
          }))
        : undefined;

      const bccRecipients: Sender[] | undefined = data.bcc
        ? data.bcc.map((email) => ({
            email,
            name: email.split('@')[0] || 'User',
          }))
        : undefined;

      const zeroSignature = settings?.settings.zeroSignature
        ? '<p style="color: #666; font-size: 12px;">Sent via <a href="https://devlab.io/" style="color: #6f00ff; text-decoration: none;">Reta by Devlab</a></p>'
        : '';

      const emailBody =
        mode === 'forward'
          ? constructForwardBody(
              data.message + zeroSignature,
              new Date(replyToMessage.receivedOn || '').toLocaleString(),
              { ...replyToMessage.sender, subject: replyToMessage.subject },
              toRecipients,
              //   replyToMessage.decodedBody,
            )
          : constructReplyBody(
              data.message + zeroSignature,
              new Date(replyToMessage.receivedOn || '').toLocaleString(),
              replyToMessage.sender,
              toRecipients,
              //   replyToMessage.decodedBody,
            );

      // P15 final : fil partagé — l'envoi exige l'INTENT SERVEUR du partage
      // retenu (baseline côté base, jamais un timestamp client). S'il n'a pas
      // pu être émis au montage, on le crée ici ; un échec jette et garde le
      // composeur ouvert (fail closed, cohérent avec le refus serveur).
      const replyIntentId = share ? await ensureReplyIntent(share.id) : undefined;

      const payload = {
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject: data.subject,
        message: emailBody,
        attachments: await serializeFiles(data.attachments),
        fromEmail: fromEmail,
        draftId: draftId ?? undefined,
        headers: {
          'In-Reply-To': replyToMessage?.messageId ?? '',
          References: [
            ...(replyToMessage?.references ? replyToMessage.references.split(' ') : []),
            replyToMessage?.messageId,
          ]
            .filter(Boolean)
            .join(' '),
          'Thread-Id': replyToMessage?.threadId ?? '',
        },
        threadId: replyToMessage?.threadId,
        isForward: mode === 'forward',
        originalMessage: replyToMessage.decodedBody,
        scheduleAt: data.scheduleAt,
        clientSendId,
        // L'override est un choix HUMAIN pris sur le bandeau de collision,
        // consommé ONE-SHOT côté serveur pour CET intent uniquement.
        teamThreadId: share?.id,
        replyIntentId,
        overrideCollision: pendingOverrideRef.current || undefined,
      };
      pendingOverrideRef.current = false;

      // Jalon perf : send:dispatched → send:confirmed mesure la round-trip
      // jusqu'à l'enqueue durable (plus aucun aller-retour Gmail dedans).
      markStage('send:dispatched');
      const result = await sendEmail(payload);

      // P15 : collision détectée — un coéquipier a répondu ou détient le
      // claim. AUCUN envoi n'a eu lieu ; le composeur reste ouvert avec un
      // bandeau et un bouton d'override explicite. Jamais d'auto-send.
      if (
        typeof result === 'object' &&
        result !== null &&
        'collision' in result &&
        result.collision
      ) {
        setCollisionReasons((result.collision as { reasons: Array<{ type: string }> }).reasons);
        toast.dismiss(sendingToast);
        return;
      }

      // Intent expiré/invalide (24 h dépassées, contexte changé côté serveur) :
      // purger le cache, en émettre un frais et demander un renvoi — jamais un
      // échec générique muet.
      if (
        typeof result === 'object' &&
        result !== null &&
        'error' in result &&
        result.error === 'reply_intent_invalid' &&
        share
      ) {
        replyIntentsRef.current.delete(share.id);
        void ensureReplyIntent(share.id).catch(() => {});
        toast.dismiss(sendingToast);
        toast.error(m['common.teams.collisionIntentInvalid']());
        return;
      }

      // `mail.send` répond `{ success: false, error }` sans throw quand
      // l'enqueue durable a échoué : le plier en erreur garde le contenu
      // ouvert et récupérable, avec la même clé de soumission pour le retry.
      const outcome = interpretSendOutcome(result);
      if (!outcome.ok) {
        throw new Error(typeof outcome.error === 'string' ? outcome.error : 'Send failed');
      }
      // Enqueue confirmé : la prochaine soumission est une nouvelle clé.
      sendSubmissionKeyRef.current = null;

      markStage('send:confirmed');

      // Suivi asynchrone : un échec Gmail après l'enqueue devient un toast
      // actionnable (Retry) au lieu d'un faux succès silencieux.
      if (isSendResult(result)) {
        watchSendStatus(result.messageId, result.sendAt);
      }
      posthog.capture('Reply Email Sent');
      toast.dismiss(sendingToast);

      // Close the composer immediately; reconcile the thread in the BACKGROUND.
      // The blocking `await refetch()` was the measured cold-path stall (W2-H) —
      // it is now fire-and-forget so the send feels instant. Purge atomique :
      // même écriture d'URL pour mode/activeReplyId/draftId (CUA round 3).
      void purgeReplyState();
      void refetch();

      if (isSendResult(result) && settings?.settings?.undoSendEnabled) {
        handleUndoSend(result, settings, {
          to: data.to,
          cc: data.cc,
          bcc: data.bcc,
          subject: data.subject,
          message: data.message,
          attachments: data.attachments,
          scheduleAt: data.scheduleAt,
        });
      } else {
        // Sans fenêtre d'annulation, la disparition du toast « envoi… » était
        // le seul signal : confirmer explicitement une fois le serveur résolu.
        toast.success(
          data.scheduleAt
            ? m['common.undoSend.emailScheduled']()
            : m['common.undoSend.emailSent'](),
        );
      }
    } catch (error) {
      toast.dismiss(sendingToast);
      log.error('Error sending email:', error);
      toast.error(m['pages.createEmail.failedToSendEmail']());
    }
  };

  useEffect(() => {
    if (mode) {
      enableScope('compose');
    } else {
      disableScope('compose');
    }
    return () => {
      disableScope('compose');
    };
  }, [mode, enableScope, disableScope]);

  const ensureEmailArray = (emails: string | string[] | undefined | null): string[] => {
    if (!emails) return [];
    if (Array.isArray(emails)) {
      return emails.map((email) => email.trim().replace(/[<>]/g, ''));
    }
    if (typeof emails === 'string') {
      return emails
        .split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0)
        .map((email) => email.replace(/[<>]/g, ''));
    }
    return [];
  };

  if (!mode || !emailData) return null;

  return (
    <div className="w-full overflow-visible rounded-2xl border">
      {requiresSelector && share && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[11px]">
          <label htmlFor="reply-team-context" className="text-muted-foreground shrink-0">
            {m['common.teams.teamContextLabel']()}
          </label>
          {/* <select> natif : accessible clavier d'office (flèches + Entrée). */}
          <select
            id="reply-team-context"
            data-testid="team-context-selector"
            className="bg-background focus-visible:ring-ring min-w-0 rounded-md border px-1.5 py-0.5 text-[11px] focus-visible:outline-none focus-visible:ring-2"
            value={share.id}
            onChange={(event) => {
              // Changement de contexte : la collision/override d'un autre
              // partage ne se transporte jamais.
              setSelectedShareId(event.target.value);
              setCollisionReasons([]);
              pendingOverrideRef.current = false;
            }}
          >
            {shares.map((row: { id: string; teamName: string }) => (
              <option key={row.id} value={row.id}>
                {row.teamName}
              </option>
            ))}
          </select>
        </div>
      )}
      {replyingMemberNames.length > 0 && (
        <p
          className="text-muted-foreground border-b px-3 py-1.5 text-[11px]"
          role="status"
          data-testid="team-replying-banner"
        >
          {m['common.teams.alsoReplying']({ names: replyingMemberNames.join(', ') })}
        </p>
      )}
      {collisionReasons.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
          data-testid="team-collision-banner"
        >
          <span className="min-w-0 flex-1">
            {collisionReasons.some((reason) => reason.type === 'inbound_member_reply')
              ? m['common.teams.collisionInbound']()
              : m['common.teams.collisionClaim']()}
          </span>
          <button
            type="button"
            className="shrink-0 rounded-md border border-amber-500/40 px-2 py-1 font-medium hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            onClick={() => {
              // Override HUMAIN frais : vaut pour cette soumission seulement.
              pendingOverrideRef.current = true;
              setCollisionReasons([]);
              if (lastSendDataRef.current) void handleSendEmail(lastSendDataRef.current);
            }}
          >
            {m['common.teams.collisionOverride']()}
          </button>
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-1 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            onClick={() => setCollisionReasons([])}
          >
            {m['common.teamRules.cancel']()}
          </button>
        </div>
      )}
      <Suspense
        fallback={
          <div className="flex h-[120px] w-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          </div>
        }
      >
        {/* Owner-transition fix : owner résolu par le parent, remount atomique
            du composeur au changement de compte/connexion (jamais l'état de A
            peint ou persisté sous B). */}
        <ComposerOwnerGate>
          {(draftOwner) => (
            <EmailComposer
              draftOwner={draftOwner}
              editorClassName="min-h-[50px]"
              className="max-w-none! w-full overflow-visible pb-1"
              onSendEmail={handleSendEmail}
              onClose={async () => {
                // Purge ATOMIQUE (une seule écriture d'URL) : trois setters séparés
                // laissaient l'URL conserver mode/activeReplyId/draftId alors que le
                // composer était masqué (CUA round 3, échec 3). threadId est ÉPINGLÉ
                // explicitement dans la même écriture (CUA round 4) : fermer le
                // reply ne doit ni perdre ni laisser ressusciter le fil ouvert.
                await purgeReplyState({ threadId });
              }}
              onAbandonEmpty={() => {
                // Composer vidé puis fermé : le brouillon serveur correspondant est
                // un abandon — supprimé en best-effort (par draftId quand il est
                // connu) et marqué localement (trace + défense en profondeur).
                if (latestDraft?.id) markDraftAbandoned(latestDraft.id);
                const abandonedId = draftId;
                if (!abandonedId) return;
                void deleteDraft({ id: abandonedId })
                  .then(() => void refetch())
                  .catch(() => {
                    // Suppression best-effort : un échec ne doit pas bloquer la
                    // fermeture ; le brouillon restera visible dans Drafts.
                  });
              }}
              // CUA round 4 (échec 1) : le « a » vu à l'ouverture était le brouillon
              // serveur abandonné au round 3, resservi par latestDraft?.decodedBody.
              // Un reply ouvert au raccourci démarre VIDE : la reprise d'un travail
              // en cours est portée par le snapshot local (restauration issue #34),
              // celle d'un brouillon par un draftId EXPLICITE (ouverture depuis
              // Drafts). Aucun contenu serveur n'est ressemé implicitement.
              initialMessage={draft?.content ?? undefined}
              initialTo={draft ? ensureEmailArray(draft.to) : replyDefaults.to}
              initialCc={draft ? ensureEmailArray(draft.cc) : replyDefaults.cc}
              initialBcc={ensureEmailArray(draft?.bcc)}
              initialSubject={draft?.subject ?? replyDefaults.subject}
              autofocus={true}
              settingsLoading={settingsLoading}
              replyingTo={replyToMessage?.sender.email}
              quoteRequest={quoteRequest}
              onQuoteInserted={onQuoteInserted}
            />
          )}
        </ComposerOwnerGate>
      </Suspense>
    </div>
  );
}

/**
 * Onboarding collaboration (P13) — logique pure côté client.
 *
 * L'état des étapes est DÉRIVÉ côté serveur (teams.onboardingStatus) depuis
 * les données réelles ; ici ne vivent que le modèle d'affichage et la
 * décision analytics. Analytics minimales, notification-only : un événement
 * par première transition observée, dédupliqué par (user, team) via un
 * instantané localStorage — jamais de re-émission sur re-render ni sur
 * re-visite.
 */

export type CollabStepKey =
  | 'team_created'
  | 'invite_accepted'
  | 'first_share'
  | 'first_comment'
  | 'first_assignment_done';

export type CollabOnboardingStatus = {
  teamId: string;
  teamCreatedAt: string;
  steps: Record<CollabStepKey, { done: boolean; at: string | null }>;
  inviteSent: boolean;
  loopCompletedAt: string | null;
  loopElapsedMs: number | null;
  dismissedAt: string | null;
};

/** Ordre canonique de la boucle de collaboration. */
export const COLLAB_STEP_ORDER: readonly CollabStepKey[] = [
  'team_created',
  'invite_accepted',
  'first_share',
  'first_comment',
  'first_assignment_done',
] as const;

export function firstOpenStep(status: CollabOnboardingStatus): CollabStepKey | null {
  for (const key of COLLAB_STEP_ORDER) {
    if (!status.steps[key].done) return key;
  }
  return null;
}

export function completedStepCount(status: CollabOnboardingStatus): number {
  return COLLAB_STEP_ORDER.filter((key) => status.steps[key].done).length;
}

// --- analytics ---------------------------------------------------------------

export type CollabAnalyticsEvent =
  | 'collab_team_created'
  | 'collab_invite_accepted'
  | 'collab_first_share'
  | 'collab_first_comment'
  | 'collab_first_assignment_completed'
  | 'collab_loop_completed';

export const COLLAB_ANALYTICS_EVENTS: readonly CollabAnalyticsEvent[] = [
  'collab_team_created',
  'collab_invite_accepted',
  'collab_first_share',
  'collab_first_comment',
  'collab_first_assignment_completed',
  'collab_loop_completed',
] as const;

const STEP_TO_EVENT: Record<CollabStepKey, CollabAnalyticsEvent> = {
  team_created: 'collab_team_created',
  invite_accepted: 'collab_invite_accepted',
  first_share: 'collab_first_share',
  first_comment: 'collab_first_comment',
  first_assignment_done: 'collab_first_assignment_completed',
};

export type CollabAnalyticsSnapshot = {
  fired: CollabAnalyticsEvent[];
};

export type CollabAnalyticsDecision = {
  events: Array<{ name: CollabAnalyticsEvent; properties: Record<string, unknown> }>;
  snapshot: CollabAnalyticsSnapshot;
};

/**
 * Décide les événements à émettre pour CE statut, sachant ce qui a déjà été
 * émis. `collab_loop_completed` porte le temps écoulé création → boucle
 * complète ; les autres n'emportent que le teamId.
 */
export function decideCollabAnalytics(
  previous: CollabAnalyticsSnapshot | null,
  status: CollabOnboardingStatus,
): CollabAnalyticsDecision {
  const fired = new Set<CollabAnalyticsEvent>(previous?.fired ?? []);
  const events: CollabAnalyticsDecision['events'] = [];

  for (const key of COLLAB_STEP_ORDER) {
    const eventName = STEP_TO_EVENT[key];
    if (status.steps[key].done && !fired.has(eventName)) {
      const occurredAt = status.steps[key].at;
      events.push({
        name: eventName,
        properties: {
          teamId: status.teamId,
          occurredAt,
          // PostHog déduplique ce même fait même s'il est observé depuis deux
          // appareils ou par deux membres de l'équipe.
          $insert_id: `collab:${status.teamId}:${eventName}:${occurredAt ?? 'unknown'}`,
        },
      });
      fired.add(eventName);
    }
  }

  if (status.loopCompletedAt !== null && !fired.has('collab_loop_completed')) {
    events.push({
      name: 'collab_loop_completed',
      properties: {
        teamId: status.teamId,
        occurredAt: status.loopCompletedAt,
        elapsedMs: status.loopElapsedMs,
        $insert_id: `collab:${status.teamId}:collab_loop_completed:${status.loopCompletedAt}`,
      },
    });
    fired.add('collab_loop_completed');
  }

  return { events, snapshot: { fired: [...fired] } };
}

export function collabSnapshotStorageKey(userId: string, teamId: string): string {
  return `collab-onboarding:v1:${userId}:${teamId}`;
}

export function parseCollabSnapshot(raw: string | null): CollabAnalyticsSnapshot | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as { fired?: unknown }).fired) &&
      (parsed as { fired: unknown[] }).fired.every(
        (entry) =>
          typeof entry === 'string' &&
          COLLAB_ANALYTICS_EVENTS.includes(entry as CollabAnalyticsEvent),
      )
    ) {
      return { fired: (parsed as { fired: CollabAnalyticsEvent[] }).fired };
    }
  } catch {
    // instantané corrompu → repartir de zéro (au pire un événement re-émis)
  }
  return null;
}

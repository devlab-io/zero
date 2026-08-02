import {
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
} from '@zero/server/auth-providers';
import { $fetch } from '@/lib/auth-client';

/**
 * P11 — voie d'autorisation INCRÉMENTALE des DISPONIBILITÉS (freebusy).
 *
 * Le login par défaut n'est JAMAIS élargi (GOOGLE_OAUTH_SCOPES est sans
 * calendrier — invariant figé par google-scopes.test.ts). Quand l'utilisateur
 * veut afficher ses disponibilités, il déclenche EXPLICITEMENT ce flux :
 * better-auth `/link-social` relance un consentement Google DÉDIÉ au seul
 * scope calendar.freebusy — libre/occupé UNIQUEMENT, le contenu des
 * événements reste invisible (jamais calendar.readonly). Toute UI branchée
 * ici parle de « disponibilités », jamais de « calendrier ». Aucun événement
 * n'est jamais créé par Reta (deeplink fournisseur, Save humain).
 */

export { GOOGLE_CALENDAR_EVENTS_SCOPE, GOOGLE_CALENDAR_FREEBUSY_SCOPE };

export type LinkedAccountScopes = {
  providerId?: string | null;
  provider?: string | null;
  scopes?: readonly string[] | null;
};

/** true ⇔ un compte Google lié porte DÉJÀ le scope disponibilités (freebusy). */
export function hasCalendarFreebusyScope(accounts: readonly LinkedAccountScopes[]): boolean {
  return accounts.some((account) => {
    const provider = account.providerId ?? account.provider;
    if (provider !== 'google') return false;
    return (account.scopes ?? []).includes(GOOGLE_CALENDAR_FREEBUSY_SCOPE);
  });
}

export type CalendarAuthorizationRequest = {
  provider: 'google';
  scopes: [typeof GOOGLE_CALENDAR_FREEBUSY_SCOPE];
  callbackURL: string;
};

/**
 * Corps EXACT du /link-social : provider google + le SEUL scope freebusy.
 * Isolé en fonction pure pour que le test fige qu'aucun autre scope ne peut
 * s'y glisser.
 */
export function buildCalendarAuthorizationRequest(
  callbackURL: string,
): CalendarAuthorizationRequest {
  return {
    provider: 'google',
    scopes: [GOOGLE_CALENDAR_FREEBUSY_SCOPE],
    callbackURL,
  };
}

/**
 * Déclenche le consentement incrémental. Retourne l'URL de redirection Google
 * fournie par better-auth ; l'appelant navigue (le consentement reste un geste
 * humain dans l'UI Google).
 */
export async function requestCalendarFreebusyAuthorization(
  callbackURL: string,
): Promise<{ url?: string; redirect?: boolean }> {
  const { data, error } = await $fetch<{ url?: string; redirect?: boolean }>('/link-social', {
    method: 'POST',
    body: buildCalendarAuthorizationRequest(callbackURL),
  });
  if (error) {
    throw new Error(error.message ?? 'Calendar authorization request failed');
  }
  return data ?? {};
}

export type CalendarEventsAuthorizationRequest = {
  provider: 'google';
  scopes: [typeof GOOGLE_CALENDAR_EVENTS_SCOPE];
  callbackURL: string;
};

/**
 * Consentement dédié au panneau Agenda. Le provider Google Better Auth est
 * configuré avec accessType=offline, donc le refresh token reste géré dans la
 * frontière d'authentification — jamais dans le client.
 */
export function buildCalendarEventsAuthorizationRequest(
  callbackURL: string,
): CalendarEventsAuthorizationRequest {
  return {
    provider: 'google',
    scopes: [GOOGLE_CALENDAR_EVENTS_SCOPE],
    callbackURL,
  };
}

export async function requestCalendarEventsAuthorization(
  callbackURL: string,
): Promise<{ url?: string; redirect?: boolean }> {
  const { data, error } = await $fetch<{ url?: string; redirect?: boolean }>('/link-social', {
    method: 'POST',
    body: buildCalendarEventsAuthorizationRequest(callbackURL),
  });
  if (error) throw new Error(error.message ?? 'Calendar authorization request failed');
  return data ?? {};
}

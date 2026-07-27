// agent-names — contrat de nommage des instances du Durable Object `ZeroAgent`, partagé
// entre le client (apps/mail, qui PROPOSE un nom) et le serveur (apps/server, qui
// l'AUTORISE). C'est un contrat de frontière, d'où sa place dans @zero/types.
//
// POURQUOI CE FICHIER EXISTE — l'instance était partagée entre tous les locataires.
// `partyserver` résout l'instance par `doNamespace.idFromName(name)` où `name` est le
// segment d'URL `/agents/zero-agent/<name>/…` (routePartykitRequest, dist/index.js:302).
// Le nom EST donc l'identité du stockage. Le garde d'autorisation exemptait le nom
// littéral `general` sans regarder ni propriétaire ni locataire : tout utilisateur
// authentifié atteignait la MÊME instance, donc la même table
// `cf_ai_chat_agent_messages` — lecture des conversations d'autrui via
// `GET /agents/zero-agent/general/get-messages`, écrasement et effacement inter-locataires
// via le WebSocket (`persistMessages` efface la table puis réinsère).
//
// La correction est STRUCTURELLE, pas comportementale : un utilisateur sans connexion
// active n'obtient plus un nom partagé mais SON PROPRE nom, dérivé de son identifiant.
// Il n'y a donc plus d'état commun à protéger, quel que soit ce que la bibliothèque
// `agents` persiste, et quand. C'est le seul choix qui tienne : `AIChatAgent` (agents
// 0.0.106) écrit et lit cette table depuis SES propres méthodes — `onMessage`,
// `persistMessages`, `saveMessages`, `onRequest('/get-messages')` — dont certaines
// s'exécutent avant que le code applicatif ne reprenne la main. Un garde placé dans le
// code applicatif arriverait toujours après coup sur au moins un de ces chemins.
//
// Le nom est PROPOSÉ par le client mais VÉRIFIÉ par le serveur : `authorizeAgentAccess`
// n'accorde l'accès à un nom personnel que s'il est EXACTEMENT `personalAgentName(userId)`
// de la session appelante. Proposer celui d'un autre est refusé (403).

/**
 * Préfixe des instances personnelles. Le nom voyage dans un segment d'URL : il ne doit
 * contenir que des caractères sûrs, ce que garantissent les identifiants d'utilisateur
 * (better-auth : alphanumériques).
 */
export const PERSONAL_AGENT_PREFIX = 'user-';

/**
 * Ancien nom partagé. Conservé UNIQUEMENT pour être reconnu et refusé : il n'est plus
 * accordé par l'autorisation et plus proposé par le client. L'instance historique qui
 * porte ce nom en production reste inaccessible mais non vidée — cf. rapport.
 */
export const LEGACY_SHARED_AGENT_NAME = 'general';

/** Nom de l'instance propre à un utilisateur, sans connexion de messagerie associée. */
export const personalAgentName = (userId: string): string => `${PERSONAL_AGENT_PREFIX}${userId}`;

export const isPersonalAgentName = (name: string): boolean =>
  name.startsWith(PERSONAL_AGENT_PREFIX);

/**
 * Vrai quand le nom de l'instance est un identifiant de CONNEXION de messagerie, c'est-à-dire
 * quand l'agent a une boîte aux lettres sur laquelle agir. Faux pour une instance
 * personnelle (et pour l'ancien nom partagé) : le chat y est un no-op, aucun outil ne doit
 * s'y exécuter, rien ne doit y être persisté ni diffusé.
 */
export const hasMailboxScope = (name: string): boolean =>
  name.length > 0 && !isPersonalAgentName(name) && name !== LEGACY_SHARED_AGENT_NAME;

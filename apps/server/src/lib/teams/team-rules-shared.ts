/**
 * Types PARTAGÉS des règles d'équipe (P14) — module feuille STRICT : aucun
 * import. La frontière tRPC (app-router.boundary.d.ts) référence ce module
 * par `import("../lib/teams/team-rules-shared")` ; il ne doit jamais tirer le
 * graphe serveur (schema, env, driver) dans le tsc d'apps/mail.
 */

/** Fenêtre ouvrée d'une équipe (P14 SLA / P16) — jours locaux 0=dim…6=sam, 'HH:MM'. */
export type TeamBusinessHours = {
  days: number[];
  start: string;
  end: string;
};

export type TeamRuleTriggers = {
  /** Emails exacts d'expéditeur (minuscule). */
  senders?: string[];
  /** Domaines d'expéditeur sans « @ » (minuscule). */
  domains?: string[];
  /** Emails présents dans To/Cc (minuscule). */
  recipients?: string[];
  /** Sous-chaînes cherchées dans sujet + corps du dernier message (minuscule). */
  keywords?: string[];
  /** Labels Gmail (id ou nom) présents sur le dernier message. */
  gmailLabels?: string[];
  /** Plage horaire de réception, en zone IANA ; from > to = plage nocturne. */
  hours?: { days?: number[]; from: string; to: string; timeZone: string };
};

export type TeamRuleAction =
  | { kind: 'share'; visibility: 'team' }
  | { kind: 'assign'; userId: string }
  | { kind: 'label'; labelIds: string[] }
  | { kind: 'todo'; assigneeUserId?: string }
  | { kind: 'snooze'; hours: number }
  | { kind: 'notify'; userIds: string[] };

export type RuleActionKind = TeamRuleAction['kind'];

export type TriggerFamily = keyof TeamRuleTriggers;

export type TriggerReason = {
  trigger: TriggerFamily;
  matched: boolean;
  detail: string;
  /** Famille non évaluable dans ce contexte (preview sur projection) — exclue du verdict. */
  unavailable?: boolean;
};

export type RuleVerdict = {
  matched: boolean;
  /** Vrai quand au moins une famille n'était pas évaluable (verdict partiel). */
  partial: boolean;
  reasons: TriggerReason[];
};

export type RuleActionRecord = {
  kind: RuleActionKind;
  ok: boolean;
  reason?: string;
  /** État POSÉ par ce run (préflight d'undo : l'inverse ne s'applique que si l'état courant y correspond encore). */
  applied?: Record<string, unknown> | null;
  inverse?: Record<string, unknown> | null;
};

/** Issue d'une demande d'annulation — jamais 'undone' sans succès COMPLET des inverses. */
export type RuleUndoResult = {
  status: 'undone' | 'conflicted' | 'failed';
  /** Conflits de préflight (status 'conflicted') : rien n'a été muté. */
  conflicts: string[];
  /** Détail d'exécution des inverses (status 'undone' ou 'failed'). */
  undone: Array<{ kind: RuleActionKind; ok: boolean; reason?: string }>;
};

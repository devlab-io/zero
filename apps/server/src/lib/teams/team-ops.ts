import { businessMinutesBetween, type BusinessWindow } from './business-time';

/**
 * Dashboard opérations d'équipe (P16) — agrégats PURS, testés sans Postgres.
 *
 * Honnêteté des métriques, par construction :
 * - « première réponse » = premier envoi ENREGISTRÉ VIA RETA (send_job d'un
 *   membre sur le fil, postérieur au partage). Reta ne prétend jamais
 *   connaître les réponses envoyées directement depuis Gmail ou ailleurs.
 * - les durées SLA sont en minutes OUVRÉES (fenêtre de la politique d'équipe,
 *   DST géré par business-time) ; sans politique, pas d'overdue.
 * - médiane et p90 en nearest-rank, TOUJOURS accompagnés du sampleSize.
 * - le workload est un décompte par membre, trié ALPHABÉTIQUEMENT — jamais un
 *   classement ni un score individuel.
 */

export type OpsThreadRow = {
  teamThreadId: string;
  subject: string;
  status: 'open' | 'closed';
  assigneeUserId: string | null;
  /** Partage dans Reta (team_thread.created_at) — l'origine de tout délai. */
  sharedAtMs: number;
  /** Premier envoi d'un MEMBRE via Reta après le partage — null si aucun. */
  firstReplyAtMs: number | null;
  /** Premier passage à « Done » (audit) — null si jamais clos. */
  firstClosedAtMs: number | null;
};

export type OpsAuditEvent = {
  subjectId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAtMs: number;
};

export type OpsSlaTargets = {
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  window: BusinessWindow;
} | null;

export type OpsDurationStats = {
  medianMinutes: number | null;
  p90Minutes: number | null;
  sampleSize: number;
};

/** Percentile nearest-rank sur valeurs en minutes (documenté, pas d'interpolation). */
export function nearestRank(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export function durationStats(minutes: number[]): OpsDurationStats {
  return {
    medianMinutes: nearestRank(minutes, 50),
    p90Minutes: nearestRank(minutes, 90),
    sampleSize: minutes.length,
  };
}

export type OpsOverdue = {
  /** null = pas d'objectif configuré (métrique absente, pas « zéro »). */
  firstResponse: number | null;
  resolution: number | null;
};

export function computeOverdue(
  rows: OpsThreadRow[],
  sla: OpsSlaTargets,
  nowMs: number,
): OpsOverdue {
  if (!sla) return { firstResponse: null, resolution: null };
  let firstResponse: number | null = null;
  let resolution: number | null = null;
  if (sla.firstResponseMinutes !== null) {
    firstResponse = rows.filter(
      (row) =>
        row.status === 'open' &&
        row.firstReplyAtMs === null &&
        businessMinutesBetween(row.sharedAtMs, nowMs, sla.window) > sla.firstResponseMinutes!,
    ).length;
  }
  if (sla.resolutionMinutes !== null) {
    resolution = rows.filter(
      (row) =>
        row.status === 'open' &&
        businessMinutesBetween(row.sharedAtMs, nowMs, sla.window) > sla.resolutionMinutes!,
    ).length;
  }
  return { firstResponse, resolution };
}

/** Plus ancien fil OUVERT sans réponse enregistrée via Reta. */
export function oldestOpenWithoutReply(rows: OpsThreadRow[]): OpsThreadRow | null {
  const candidates = rows.filter((row) => row.status === 'open' && row.firstReplyAtMs === null);
  if (candidates.length === 0) return null;
  return candidates.reduce((oldest, row) => (row.sharedAtMs < oldest.sharedAtMs ? row : oldest));
}

export function responseAndResolutionStats(
  rows: OpsThreadRow[],
  window: BusinessWindow | null,
): { firstResponse: OpsDurationStats; resolution: OpsDurationStats } {
  const respond: number[] = [];
  const resolve: number[] = [];
  for (const row of rows) {
    if (row.firstReplyAtMs !== null && row.firstReplyAtMs > row.sharedAtMs) {
      respond.push(
        window
          ? businessMinutesBetween(row.sharedAtMs, row.firstReplyAtMs, window)
          : Math.round((row.firstReplyAtMs - row.sharedAtMs) / 60_000),
      );
    }
    if (row.firstClosedAtMs !== null && row.firstClosedAtMs > row.sharedAtMs) {
      resolve.push(
        window
          ? businessMinutesBetween(row.sharedAtMs, row.firstClosedAtMs, window)
          : Math.round((row.firstClosedAtMs - row.sharedAtMs) / 60_000),
      );
    }
  }
  return { firstResponse: durationStats(respond), resolution: durationStats(resolve) };
}

/**
 * Réouvertures et transferts, dérivés des événements d'audit d'un même fil,
 * triés chronologiquement : réouverture = passage closed→open ; transfert =
 * deux assignations successives non nulles vers des membres différents.
 */
export function reopeningsAndTransfers(events: OpsAuditEvent[]): {
  reopenings: number;
  transfers: number;
} {
  const byThread = new Map<string, OpsAuditEvent[]>();
  for (const event of events) {
    const list = byThread.get(event.subjectId) ?? [];
    list.push(event);
    byThread.set(event.subjectId, list);
  }
  let reopenings = 0;
  let transfers = 0;
  for (const list of byThread.values()) {
    list.sort((a, b) => a.createdAtMs - b.createdAtMs);
    let lastStatus: string | null = null;
    let lastAssignee: string | null = null;
    for (const event of list) {
      if (event.action === 'thread.status_changed') {
        const status = event.metadata['status'];
        if (status === 'open' && lastStatus === 'closed') reopenings++;
        if (status === 'open' || status === 'closed') lastStatus = String(status);
      } else if (event.action === 'thread.assigned') {
        const assignee = (event.metadata['assigneeUserId'] as string | null) ?? null;
        if (assignee && lastAssignee && assignee !== lastAssignee) transfers++;
        lastAssignee = assignee ?? lastAssignee;
      }
    }
  }
  return { reopenings, transfers };
}

export type OpsWorkloadRow = { userId: string; name: string; openAssigned: number };

/** Décompte des fils ouverts par assigné — trié alphabétiquement, sans score. */
export function workloadByMember(
  rows: OpsThreadRow[],
  members: Array<{ userId: string; name: string }>,
): OpsWorkloadRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === 'open' && row.assigneeUserId) {
      counts.set(row.assigneeUserId, (counts.get(row.assigneeUserId) ?? 0) + 1);
    }
  }
  return members
    .map((member) => ({
      userId: member.userId,
      name: member.name,
      openAssigned: counts.get(member.userId) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type OpsLabelVolume = { labelId: string; name: string; shared: number; resolved: number };

/**
 * Volume partagé / résolu PAR LABEL d'équipe — construit exclusivement sur
 * les fils déjà passés par l'ACL de l'appelant (les liens fournis ne
 * concernent que ces fils). Un fil multi-labels compte dans CHACUN de ses
 * labels ; shared et resolved sont des ensembles distincts (un fil peut être
 * l'un, l'autre, ou les deux). Labels sans activité dans la fenêtre : omis.
 */
export function labelVolumes(
  links: Array<{ teamThreadId: string; labelId: string; labelName: string }>,
  sharedInWindowIds: ReadonlySet<string>,
  resolvedInWindowIds: ReadonlySet<string>,
): OpsLabelVolume[] {
  const byLabel = new Map<string, OpsLabelVolume>();
  const seen = new Set<string>();
  for (const link of links) {
    const key = `${link.teamThreadId}:${link.labelId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const shared = sharedInWindowIds.has(link.teamThreadId) ? 1 : 0;
    const resolved = resolvedInWindowIds.has(link.teamThreadId) ? 1 : 0;
    if (shared === 0 && resolved === 0) continue;
    const entry =
      byLabel.get(link.labelId) ??
      ({ labelId: link.labelId, name: link.labelName, shared: 0, resolved: 0 } as OpsLabelVolume);
    entry.shared += shared;
    entry.resolved += resolved;
    byLabel.set(link.labelId, entry);
  }
  return [...byLabel.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const PROCESSING_STUCK_MINUTES = 15;

export function stuckProcessingRuns(
  runs: Array<{ id: string; ruleName: string; createdAtMs: number }>,
  nowMs: number,
): Array<{ id: string; ruleName: string; ageMinutes: number }> {
  return runs
    .map((run) => ({
      id: run.id,
      ruleName: run.ruleName,
      ageMinutes: Math.floor((nowMs - run.createdAtMs) / 60_000),
    }))
    .filter((run) => run.ageMinutes >= PROCESSING_STUCK_MINUTES);
}

export type OpsCoverageRow = {
  userId: string;
  name: string;
  /** Absence déclarée couvrant `now` — null si disponible. */
  absentUntilMs: number | null;
};

export function coverage(
  members: Array<{ userId: string; name: string }>,
  absences: Array<{ userId: string; startsAtMs: number; endsAtMs: number }>,
  nowMs: number,
): { rows: OpsCoverageRow[]; availableCount: number } {
  const rows = members
    .map((member) => {
      const active = absences
        .filter(
          (absence) =>
            absence.userId === member.userId &&
            absence.startsAtMs <= nowMs &&
            absence.endsAtMs > nowMs,
        )
        .sort((a, b) => b.endsAtMs - a.endsAtMs)[0];
      return { userId: member.userId, name: member.name, absentUntilMs: active?.endsAtMs ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows, availableCount: rows.filter((row) => row.absentUntilMs === null).length };
}

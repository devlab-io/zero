/**
 * P6 — « snoozes à venir » du dashboard : compte SOURCÉ (projection DO du
 * dossier snoozed + wakeAt KV), zéro IA. Logique PURE, injectée et testée :
 * seuls les réveils STRICTEMENT futurs comptent (un wakeAt passé est en cours
 * d'unsnooze-on-access, pas « à venir »), et la troncature de page est
 * exposée — jamais un compte présenté comme exhaustif s'il ne l'est pas.
 */

export type UpcomingSnoozes = {
  count: number;
  /** Prochain réveil (ISO) — null sans snooze futur. */
  nextWakeAt: string | null;
  /** true = première page seulement : le compte est un plancher, pas un total. */
  truncated: boolean;
};

export async function selectUpcomingSnoozes(
  threadIds: readonly string[],
  readWakeAt: (threadId: string) => Promise<string | null>,
  now: number,
  truncated: boolean,
): Promise<UpcomingSnoozes> {
  const wakes: number[] = [];
  await Promise.all(
    threadIds.map(async (threadId) => {
      const wakeAtIso = await readWakeAt(threadId).catch(() => null);
      if (!wakeAtIso) return;
      const wakeAt = Date.parse(wakeAtIso);
      if (Number.isFinite(wakeAt) && wakeAt > now) wakes.push(wakeAt);
    }),
  );
  wakes.sort((a, b) => a - b);
  return {
    count: wakes.length,
    nextWakeAt: wakes.length ? new Date(wakes[0]!).toISOString() : null,
    truncated,
  };
}

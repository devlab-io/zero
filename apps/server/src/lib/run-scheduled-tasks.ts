/**
 * Orchestrateur PUR des tâches cron (adversarial-11) : chaque tâche est
 * ISOLÉE — l'échec de l'une ne prive jamais les suivantes de leur exécution
 * (le sweep outbound P18 tourne même si les emails planifiés ou les
 * souscriptions échouent). Ordre séquentiel préservé, échecs loggés et
 * retournés, jamais relancés ici.
 */
export type ScheduledTask = readonly [name: string, run: () => Promise<void>];

export async function runScheduledTasksIsolated(
  tasks: readonly ScheduledTask[],
  log: (name: string, error: unknown) => void,
): Promise<{ ran: string[]; failed: string[] }> {
  const ran: string[] = [];
  const failed: string[] = [];
  for (const [name, run] of tasks) {
    try {
      await run();
      ran.push(name);
    } catch (error) {
      failed.push(name);
      log(name, error);
    }
  }
  return { ran, failed };
}

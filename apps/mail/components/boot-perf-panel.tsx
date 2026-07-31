import { useEffect, useState } from 'react';

/**
 * Panneau de diagnostic cold boot (r12), lisible par la CUA via l'arbre AX.
 *
 * Activé UNIQUEMENT par `?bootperf=1` — absent sinon (prod-safe, diagnostic
 * seul). Affiche, en texte brut dans un élément role="status" :
 *   - chaque marque `zero:*` : startTime depuis navigationStart (les marques
 *     performance sont relatives à timeOrigin = navigationStart) ;
 *   - chaque mesure `zero:*->*` : sa durée ;
 *   - l'agrégat des long tasks (nombre / total / max), via PerformanceObserver
 *     buffered pour capter celles d'avant le montage.
 * AUCUNE donnée mail, aucun identifiant : uniquement des noms de jalons et
 * des millisecondes. Se met à jour tout seul (tick 500 ms). Rendu après
 * montage uniquement — jamais dans le HTML prérendu (pas de mismatch).
 */

type PanelLine = { key: string; text: string };

const isEnabled = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('bootperf') === '1';

export function collectBootPerfLines(): PanelLine[] {
  const lines: PanelLine[] = [];
  for (const mark of performance.getEntriesByType('mark')) {
    if (!mark.name.startsWith('zero:')) continue;
    lines.push({
      key: `mark:${mark.name}`,
      text: `${mark.name.slice('zero:'.length)} @${Math.round(mark.startTime)}ms`,
    });
  }
  for (const measure of performance.getEntriesByType('measure')) {
    if (!measure.name.startsWith('zero:')) continue;
    lines.push({
      key: `measure:${measure.name}`,
      text: `${measure.name.slice('zero:'.length)} =${Math.round(measure.duration)}ms`,
    });
  }
  return lines;
}

export function BootPerfPanel() {
  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<PanelLine[]>([]);
  const [longTasks, setLongTasks] = useState({ count: 0, total: 0, max: 0 });

  useEffect(() => {
    if (!isEnabled()) return;
    setEnabled(true);

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        setLongTasks((current) => {
          let { count, total, max } = current;
          for (const entry of list.getEntries()) {
            count += 1;
            total += entry.duration;
            if (entry.duration > max) max = entry.duration;
          }
          return { count, total, max };
        });
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      // longtask non supporté : le panneau reste utile sans.
    }

    const tick = () => setLines(collectBootPerfLines());
    tick();
    const intervalId = window.setInterval(tick, 500);
    return () => {
      window.clearInterval(intervalId);
      observer?.disconnect();
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      role="status"
      aria-label="bootperf"
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 2147483647,
        maxWidth: 380,
        padding: '8px 10px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.85)',
        color: '#7CFC00',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        lineHeight: 1.35,
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      <div>bootperf (ms depuis navigationStart)</div>
      {lines.map((line) => (
        <div key={line.key}>{line.text}</div>
      ))}
      <div>{`longtasks n=${longTasks.count} total=${Math.round(longTasks.total)}ms max=${Math.round(longTasks.max)}ms`}</div>
    </div>
  );
}

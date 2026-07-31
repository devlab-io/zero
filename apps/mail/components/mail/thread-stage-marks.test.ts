import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// r15a : garde structurelle du câblage des jalons lecteur et du contrat
// « aucun changement HTML/images ». La logique (dédupe, ordre du plan de
// prefetch) est prouvée par lib/thread-stage-once.test.ts et
// hooks/use-thread-prefetch.test.ts ; ici on fige les points de branchement
// que ces tests unitaires ne voient pas.

const read = (relative: string) => readFileSync(join(__dirname, '..', '..', relative), 'utf8');

const threadDisplay = read('components/mail/thread-display.tsx');
const messageList = read('components/mail/thread-display.message-list.tsx');
const mailContent = read('components/mail/mail-content.tsx');
const mailList = read('components/mail/mail-list.tsx');
const perfStages = read('lib/perf-stages.ts');

describe('jalons lecteur r15a — câblage', () => {
  it('l’ancien thread:body-ready (données ≠ DOM visible) a disparu du code', () => {
    for (const source of [threadDisplay, mailContent, perfStages]) {
      expect(source).not.toContain("markStage('thread:body-ready')");
      expect(source).not.toContain("'thread:body-ready':");
    }
  });

  it('thread-display pose data-ready et content-painted via la dédupe par fil', () => {
    expect(threadDisplay).toContain(
      "markThreadStageOnce(dataReadyMarkedRef, dataReadyId, () => markStage('thread:data-ready'))",
    );
    expect(threadDisplay).toContain(
      "markThreadStageOnce(contentPaintedMarkedRef, id, () => markStage('thread:content-painted'))",
    );
    expect(threadDisplay).toContain('onContentPainted: handleContentPainted');
  });

  it('les deux jalons se mesurent depuis thread:open', () => {
    expect(perfStages).toContain("'thread:data-ready': 'thread:open'");
    expect(perfStages).toContain("'thread:content-painted': 'thread:open'");
  });

  it('le callback content-painted n’atteint que le message ACTIF (dernier)', () => {
    expect(messageList).toContain(
      'onContentPainted={isLastMessage ? onContentPainted : undefined}',
    );
  });

  it('MailContent signale après injection réelle + double rAF', () => {
    // Le signal vit dans le MÊME effet que l'injection (après elle) et passe
    // par deux requestAnimationFrame imbriqués avant d'appeler le callback.
    const injectionIndex = mailContent.indexOf(
      'shadowRootRef.current.innerHTML = processedData.html;',
    );
    const firstFrameIndex = mailContent.indexOf(
      'const firstFrameId = requestAnimationFrame(() => {',
    );
    const secondFrameIndex = mailContent.indexOf(
      'secondFrameId = requestAnimationFrame(() => onContentPaintedRef.current?.());',
    );
    expect(injectionIndex).toBeGreaterThan(-1);
    expect(firstFrameIndex).toBeGreaterThan(injectionIndex);
    expect(secondFrameIndex).toBeGreaterThan(firstFrameIndex);
  });

  it('aucun changement HTML/images : injection inchangée, HTML jamais transformé', () => {
    // L'injection reste l'affectation directe du HTML traité serveur (sanitisé
    // par email-processor.ts) dans le shadow root — une seule occurrence, pas
    // de variante retravaillée ni de post-traitement client du HTML.
    const occurrences = mailContent.split('shadowRootRef.current.innerHTML = processedData.html;');
    expect(occurrences).toHaveLength(2);
    expect(mailContent).not.toContain('processedData.html.replace');
    expect(mailContent).not.toContain('processedData.html.slice');
    // La résolution CID lazy et le blocage d'images distantes restent en place.
    expect(mailContent).toContain('resolveCidImages(shadowRootRef.current, inlineImages)');
    expect(mailContent).toContain('hasBlockedImages');
  });
});

describe('priorité clic r15a — câblage mail-list', () => {
  it('le clic annule la file visible (génération + timer) via runClickPrefetchPlan', () => {
    expect(mailList).toContain('void runClickPrefetchPlan({');
    const cancelBlock = mailList.slice(mailList.indexOf('cancelSpeculative: () => {'));
    expect(cancelBlock).toContain('visiblePrefetchGenerationRef.current += 1;');
    expect(cancelBlock).toContain('clearTimeout(visiblePrefetchTimerRef.current);');
  });

  it('plus aucun départ groupé courant+suivants au clic', () => {
    expect(mailList).not.toContain('[messageThreadId, ...adjacentThreadIds]');
  });
});

// r15b : annulation réelle des vols spéculatifs déjà partis + jalon
// thread:open sur TOUTE navigation lecteur (le comportement du registre et du
// helper est prouvé unitairement ; ici on fige les branchements).
describe('annulation des vols spéculatifs r15b — câblage', () => {
  const useThreadsSource = read('hooks/use-threads.ts');

  it('le cancel vise la clé mail.get EXACTE, signal déjà propagé au fetch', () => {
    expect(useThreadsSource).toContain(
      'queryClient.cancelQueries({ queryKey: trpc.mail.get.queryKey({ id }), exact: true })',
    );
    // Sans propagation du signal dans le queryFn, cancelQueries n'aborterait
    // rien : openThread doit transmettre { signal } au client tRPC.
    expect(useThreadsSource).toContain('queryFn: async ({ signal }) => {');
    expect(useThreadsSource).toContain('{ signal },');
  });

  it('la file visible trace chaque vol dans le registre', () => {
    expect(mailList).toContain('.track(id, () => prefetchThread(id))');
  });

  it('le clic annule les vols en cours SAUF le fil ouvert', () => {
    const cancelBlock = mailList.slice(mailList.indexOf('cancelSpeculative: () => {'));
    expect(cancelBlock).toContain('speculativeFlightsRef.current.cancelAllExcept(messageThreadId,');
  });
});

describe('jalon thread:open sur navigation lecteur r15b — câblage', () => {
  const navigationSource = read('hooks/use-mail-navigation.ts');

  it('le jalon se pose juste AVANT le changement de fil, dans le point de passage unique', () => {
    const helperIndex = navigationSource.indexOf('const openThreadFromList = useCallback(');
    const markIndex = navigationSource.indexOf("markStage('thread:open');", helperIndex);
    const navigateIndex = navigationSource.indexOf(
      'onNavigateRef.current(nextThreadId);',
      helperIndex,
    );
    expect(helperIndex).toBeGreaterThan(-1);
    expect(markIndex).toBeGreaterThan(helperIndex);
    expect(navigateIndex).toBeGreaterThan(markIndex);
  });

  it('aucune navigation portant un id ne contourne le point de passage', () => {
    // Flèches/j/k (navigateToThread), Enter, actions suivant/précédent : tout
    // appel direct restant est une fermeture (null) ou le corps du helper.
    const directCalls = [...navigationSource.matchAll(/onNavigateRef\.current\(([^)]*)\)/g)].map(
      (match) => match[1],
    );
    const idBearing = directCalls.filter((argument) => argument !== 'null');
    expect(idBearing).toEqual(['nextThreadId']);
  });
});

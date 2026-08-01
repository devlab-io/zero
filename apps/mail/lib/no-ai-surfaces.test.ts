import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

// Contrat produit r9 (01/08/2026) : supersession PARTIELLE du r8 par la mission
// mail-copilot (spec docs/spec/mail-copilot.md). Aucune surface IA généraliste
// non sollicitée (résumés automatiques, recherche naturelle) ; DEUX exceptions
// nominatives, toutes deux invoquées explicitement par l'utilisateur :
//   1. l'assistant de correction/reformulation du composeur (r8) ;
//   2. le panneau Ask Reta (components/copilot/**), seul autorisé à appeler
//      trpc.copilot.*.
// Le garde-fou échoue si une autre surface ou route client revient, ou si
// copilot.* est appelé hors de la surface sanctionnée.

const APP_ROOT = join(__dirname, '..');

// r8b : TOUTES les surfaces UI atteignables du shell mail authentifié —
// components/** et app/** en entier, pas une liste étroite. Seules les pages
// MARKETING PUBLIQUES (landing components/home, page /pricing publique
// components/pricing) sont hors périmètre, conformément à la consigne « ne pas
// réécrire les pages marketing publiques ». pricing-dialog (atteignable depuis
// Get Zero Pro / Settings / NavUser) est DANS le périmètre.
const UI_SCAN_ROOTS = ['components', 'app', 'hooks', 'providers'];
const PUBLIC_MARKETING_DIRS = [
  'components/home',
  'components/pricing',
  // Groupe de routes publiques (landing /about, /pricing, /terms…) — hors
  // shell mail authentifié.
  'app/(full-width)',
];
// Couche vocale ElevenLabs : hors du périmètre nominatif r8 (non listée par
// le contrat) — seule exclusion fichier explicite, à retirer si la voix passe
// dans le périmètre.
const EXPLICIT_FILE_EXCLUSIONS = new Set(['providers/voice-provider.tsx']);
const WRITING_ASSISTANT_EXCEPTION = 'components/create/writing-assistant-button.tsx';
// r9 : la surface Ask Reta — seule autorisée à appeler les routes copilot.*.
const ASK_RETA_SANCTIONED_DIR = 'components/copilot/';

// Déclencheurs client des routes IA + promesses/surfaces IA, motifs LARGES.
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /trpc\.ai\.|trpcClient\.ai\./, why: 'appel client à une route ai.*' },
  {
    pattern: /trpc\.copilot\.|trpcClient\.copilot\./,
    why: 'appel client copilot.* hors de la surface Ask Reta sanctionnée',
  },
  // r9 (tranche 2) : le transport stream Ask Reta est lui aussi nominatif —
  // ni le module client ni l'endpoint ne s'importent hors de la surface.
  {
    pattern: /ask-reta-stream|\/api\/ask-reta/,
    why: 'transport Ask Reta hors de la surface sanctionnée',
  },
  { pattern: /Try Natural Language/, why: 'section NL du command palette' },
  { pattern: /parseNaturalLanguageSearch/, why: 'interprétation langage naturel' },
  { pattern: /generateSearchQuery/, why: 'réécriture IA de la recherche' },
  { pattern: /aiCompose|generateEmailSubject/, why: 'génération IA sujet/corps du composeur' },
  { pattern: /MoreAboutPerson|MoreAboutQuery/, why: 'panneau research IA du lecteur' },
  // Promesses produit IA (pricing-dialog r8b, promos, onboarding) : toute
  // déclinaison « AI-… », « AI chat/email/summary », « unlimited AI ».
  {
    pattern: /AI-powered|AI-generated|unlimited AI|\bAI (chat|email|summar|writing|draft)/i,
    why: 'promesse produit IA',
  },
  { pattern: /writing assistant/, why: 'promo IA' },
  { pattern: /useAISidebar|useAIFullScreen/, why: 'vestige sidebar IA' },
];

// La couche vocale (ElevenLabs, lib/) est hors du périmètre nominatif r8.
const collectSourceFiles = (dir: string): string[] => {
  const absolute = join(APP_ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { recursive: true })
    .map(String)
    .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name))
    .map((name) => join(dir, name))
    .filter((relative) => !PUBLIC_MARKETING_DIRS.some((pub) => relative.startsWith(pub)))
    .filter((relative) => !EXPLICIT_FILE_EXCLUSIONS.has(relative))
    .map((relative) => join(APP_ROOT, relative));
};

describe('contrat r8 — aucune surface IA exposée', () => {
  it('aucune surface UI atteignable ne référence une route ai.* ni une promesse/surface IA', () => {
    const offenders: string[] = [];
    for (const dir of UI_SCAN_ROOTS) {
      for (const file of collectSourceFiles(dir)) {
        const source = readFileSync(file, 'utf8');
        for (const { pattern, why } of FORBIDDEN_PATTERNS) {
          const relative = file.replace(`${APP_ROOT}/`, '');
          if (
            relative === WRITING_ASSISTANT_EXCEPTION &&
            pattern.source === /trpc\.ai\.|trpcClient\.ai\./.source
          ) {
            const routeCalls = source.match(/(?:trpc|trpcClient)\.ai\.([A-Za-z0-9_]+)/g) ?? [];
            if (routeCalls.every((call) => call === 'trpc.ai.rewriteEmail')) continue;
          }
          // r9 : dans components/copilot/**, seules les routes copilot nominatives
          // (ask, searchPreview — le replay borné de la tranche 2) sont admises.
          if (
            relative.startsWith(ASK_RETA_SANCTIONED_DIR) &&
            pattern.source === /trpc\.copilot\.|trpcClient\.copilot\./.source
          ) {
            const copilotCalls =
              source.match(/(?:trpc|trpcClient)\.copilot\.([A-Za-z0-9_]+)/g) ?? [];
            if (
              copilotCalls.every(
                (call) => call === 'trpc.copilot.ask' || call === 'trpc.copilot.searchPreview',
              )
            )
              continue;
          }
          // r9 (tranche 2) : le transport stream n'est licite que dans la surface.
          if (
            relative.startsWith(ASK_RETA_SANCTIONED_DIR) &&
            pattern.source === /ask-reta-stream|\/api\/ask-reta/.source
          ) {
            continue;
          }
          if (pattern.test(source)) {
            offenders.push(`${file.replace(APP_ROOT, '')} → ${why} (${pattern})`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('les composants IA retirés n’existent plus (chat, sidebar IA, research, preview IA)', () => {
    for (const gone of [
      'components/create/ai-chat.tsx',
      'components/ui/ai-sidebar.tsx',
      'components/ui/use-ai-sidebar.ts',
      'components/ui/prompts-dialog.tsx',
      'components/ai-toggle-button.tsx',
      'components/mail/mail-display.research.tsx',
      'components/create/email-composer.content-preview.tsx',
    ]) {
      expect(existsSync(join(APP_ROOT, gone)), `${gone} devrait être supprimé`).toBe(false);
    }
  });

  it('la recherche reste littérale/opérateurs : le sélecteur d’intention littérale est préservé', () => {
    const searchIntent = readFileSync(join(APP_ROOT, 'lib/search-intent.ts'), 'utf8');
    expect(searchIntent).toContain('isSimpleLiteralSearch');
  });
});

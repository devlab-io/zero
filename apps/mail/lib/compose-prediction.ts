/**
 * Prédiction de phrase dans l'éditeur — moteur PUR, non-mutant (P7).
 *
 * Contrat :
 *  - le moteur ne touche JAMAIS au document : il renvoie du texte ; l'éditeur
 *    l'affiche en ghost text et ne l'insère que sur acceptation explicite
 *    (Tab) — aucun remplacement silencieux ;
 *  - owner/scope-aware : une session est liée à un ownerKey
 *    (userId:connectionId[:draft]) — changer de compte ou de brouillon crée
 *    une session neuve, aucun état (phrases utilisées, requêtes en vol) ne
 *    traverse ;
 *  - anti-course : chaque requête porte une génération ; une réponse d'une
 *    génération périmée (frappe plus récente, session éliminée) est JETÉE,
 *    jamais affichée ;
 *  - fallback déterministe : le provider par défaut est une banque de phrases
 *    locale (fr/en), zéro réseau. Un provider IA (BYOK) pourra se brancher
 *    sur la même couture asynchrone en héritant des mêmes gardes.
 */

export type PredictionContext = {
  /** Ligne courante, du début de ligne au caret. */
  currentLine: string;
  /** Texte complet du document (pour éviter salutations dupliquées). */
  fullText: string;
};

export type PredictionProvider = (context: PredictionContext) => Promise<string[]>;

export type PredictionLocale = 'fr' | 'en';

export function phraseBank(
  locale: PredictionLocale,
  names: { senderName?: string; myName?: string } = {},
): string[] {
  const sender = names.senderName;
  const me = names.myName;
  if (locale === 'fr') {
    return [
      ...(sender ? [`Bonjour ${sender},`, `Ia ora na ${sender},`] : []),
      'Bonjour,',
      'Ia ora na,',
      'Merci pour votre retour.',
      'Merci pour votre message.',
      "J'espère que vous allez bien.",
      'Je me permets de revenir vers vous au sujet de notre échange.',
      'Je reviens vers vous concernant',
      "N'hésitez pas à me dire si vous avez la moindre question.",
      'Je reste à votre disposition pour toute précision.',
      'Dans l’attente de votre retour.',
      'Pouvez-vous me confirmer la bonne réception ?',
      'Je vous propose un point rapide cette semaine.',
      ...(me
        ? [`Bien cordialement,\n${me}`, `Cordialement,\n${me}`, `Mauruuru roa,\n${me}`]
        : ['Bien cordialement,', 'Cordialement,', 'Mauruuru roa,']),
    ];
  }
  return [
    ...(sender ? [`Hi ${sender},`, `Hello ${sender},`] : []),
    'Hi there,',
    'Hello,',
    'Thank you for your message.',
    'Thanks for the quick reply.',
    'I hope this email finds you well.',
    'I wanted to follow up on our previous conversation.',
    'Please let me know if you have any questions.',
    'I look forward to hearing from you.',
    'Could you confirm you received this?',
    'Happy to jump on a quick call this week.',
    ...(me
      ? [`Best regards,\n${me}`, `Kind regards,\n${me}`, `Thanks,\n${me}`]
      : ['Best regards,', 'Kind regards,', 'Thanks,']),
  ];
}

const GREETING_MARKERS = ['bonjour', 'ia ora na', 'hi ', 'hello', 'dear '];

/**
 * Classement PUR : préfixe strict (insensible à la casse, ≥ 2 chars), jamais
 * une phrase déjà utilisée, pas de re-salutation en milieu de mail. Renvoie
 * la meilleure complétion (texte RESTANT exclu — au caller de trancher).
 */
export function rankCandidates(
  candidates: string[],
  context: PredictionContext,
  used: ReadonlySet<string>,
): string | null {
  const line = context.currentLine;
  if (line.trim().length < 2) return null;
  const lower = line.toLowerCase();
  const inBody = context.fullText.length > 100;
  const matches = candidates.filter((candidate) => {
    const candidateLower = candidate.toLowerCase();
    if (!candidateLower.startsWith(lower) || candidate.length <= line.length) return false;
    if (used.has(candidate)) return false;
    if (inBody && GREETING_MARKERS.some((marker) => candidateLower.startsWith(marker))) {
      return false;
    }
    const head = candidate.split(',')[0];
    if (
      head &&
      head.length > 3 &&
      context.fullText.includes(head) &&
      !lower.startsWith(head.toLowerCase())
    ) {
      return false;
    }
    return true;
  });
  matches.sort((a, b) => a.length - b.length);
  return matches[0] ?? null;
}

export type PredictionResult = { suggestion: string | null; stale: boolean };

export class PredictionSession {
  private generation = 0;
  private disposed = false;
  private used = new Set<string>();

  constructor(
    public readonly ownerKey: string,
    private readonly provider: PredictionProvider,
  ) {}

  /** Marque une phrase comme consommée (après acceptation Tab explicite). */
  markUsed(suggestion: string) {
    this.used.add(suggestion);
  }

  hasUsed(suggestion: string) {
    return this.used.has(suggestion);
  }

  get usedSet(): ReadonlySet<string> {
    return this.used;
  }

  /**
   * Requête asynchrone gardée : seule la DERNIÈRE génération d'une session
   * vivante peut produire une suggestion. Toute résolution tardive (frappe
   * plus récente, dispose) revient { suggestion: null, stale: true }.
   */
  async request(context: PredictionContext): Promise<PredictionResult> {
    if (this.disposed) return { suggestion: null, stale: true };
    this.generation += 1;
    const myGeneration = this.generation;
    let candidates: string[];
    try {
      candidates = await this.provider(context);
    } catch {
      return { suggestion: null, stale: false };
    }
    if (this.disposed || myGeneration !== this.generation) {
      return { suggestion: null, stale: true };
    }
    return { suggestion: rankCandidates(candidates, context, this.used), stale: false };
  }

  dispose() {
    this.disposed = true;
  }
}

/**
 * Registre par owner : demander la session d'un AUTRE ownerKey élimine la
 * précédente (requêtes en vol jetées, phrases utilisées oubliées) — aucun
 * état ne traverse les comptes/brouillons.
 */
export function createPredictionRegistry(makeProvider: (ownerKey: string) => PredictionProvider) {
  let current: PredictionSession | null = null;
  return {
    session(ownerKey: string): PredictionSession {
      if (current && current.ownerKey === ownerKey) return current;
      current?.dispose();
      current = new PredictionSession(ownerKey, makeProvider(ownerKey));
      return current;
    },
    disposeAll() {
      current?.dispose();
      current = null;
    },
  };
}

/** Provider déterministe par défaut : la banque locale, zéro réseau. */
export function deterministicProvider(
  locale: PredictionLocale,
  names: { senderName?: string; myName?: string } = {},
): PredictionProvider {
  const bank = phraseBank(locale, names);
  return async () => bank;
}

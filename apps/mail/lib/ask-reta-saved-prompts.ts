import { z } from 'zod';

export type AskRetaSavedPrompt = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
};

export const ASK_RETA_DEFAULT_PROMPTS: readonly AskRetaSavedPrompt[] = [
  {
    id: 'default:organize',
    title: 'Organiser ma boîte',
    content:
      "Analyse ma boîte de réception, regroupe les sujets importants et propose-moi l'ordre de traitement le plus utile.",
    createdAt: 0,
  },
  {
    id: 'default:urgent',
    title: 'Trouver les urgences',
    content:
      'Trouve les emails urgents ou qui attendent une réponse, puis explique brièvement pourquoi ils sont prioritaires.',
    createdAt: 0,
  },
  {
    id: 'default:day',
    title: 'Planifier ma journée',
    content:
      "À partir de mes emails récents, prépare un plan d'action court pour aujourd'hui avec les réponses à rédiger en premier.",
    createdAt: 0,
  },
  {
    id: 'default:reply',
    title: 'Préparer une réponse',
    content:
      'Lis le fil ouvert, identifie les demandes précises et prépare une réponse claire, structurée et directement exploitable.',
    createdAt: 0,
  },
] as const;

const KEY_PREFIX = 'reta:ask-reta:saved-prompts:';
const MAX_PROMPTS = 30;
const MAX_RAW_CHARS = 80_000;

const promptSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(2_000),
  createdAt: z.number().int().nonnegative(),
});

const storeSchema = z.object({
  version: z.literal(1),
  prompts: z.array(promptSchema).max(MAX_PROMPTS),
});

export const askRetaSavedPromptsKey = (userId: string, connectionId: string) =>
  `${KEY_PREFIX}${userId}:${connectionId}`;

const getStore = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function loadAskRetaSavedPrompts(
  userId: string,
  connectionId: string,
): AskRetaSavedPrompt[] {
  const store = getStore();
  if (!store || !userId || !connectionId) return [];
  const key = askRetaSavedPromptsKey(userId, connectionId);
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    if (raw.length > MAX_RAW_CHARS) {
      store.removeItem(key);
      return [];
    }
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      store.removeItem(key);
      return [];
    }
    return parsed.data.prompts;
  } catch {
    return [];
  }
}

export function saveAskRetaSavedPrompts(
  userId: string,
  connectionId: string,
  prompts: readonly AskRetaSavedPrompt[],
): void {
  const store = getStore();
  if (!store || !userId || !connectionId) return;
  const candidate = {
    version: 1 as const,
    prompts: prompts.slice(0, MAX_PROMPTS).map((prompt) => ({
      id: prompt.id.slice(0, 64),
      title: prompt.title.trim().slice(0, 80),
      content: prompt.content.trim().slice(0, 2_000),
      createdAt: prompt.createdAt,
    })),
  };
  const parsed = storeSchema.safeParse(candidate);
  if (!parsed.success) return;
  try {
    store.setItem(askRetaSavedPromptsKey(userId, connectionId), JSON.stringify(parsed.data));
  } catch {
    /* Private mode/quota: prompts stay usable in-memory for the session. */
  }
}

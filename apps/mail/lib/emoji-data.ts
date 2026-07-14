import { log } from '@/lib/log';
import type { EmojiItem } from '@tiptap/extension-emoji';
// perf: the gitHubEmojis dataset (~480 kB of pure data, 1952 entries, generated 1:1 from
// @tiptap/extension-emoji's `gitHubEmojis` export) used to be bundled inside the editor
// JS chunk. It is now emitted as a hashed, immutable-cacheable JSON asset and fetched
// once, right before an editor mounts (the React.lazy factories of EmailComposer and
// AISidebar await loadGitHubEmojis() so the data is always ready when the Emoji
// extension is instantiated). Same data, same features — just off the JS critical path.
import emojiDataUrl from './github-emojis.json?url';

let cache: EmojiItem[] | null = null;
let pending: Promise<EmojiItem[]> | null = null;

export function loadGitHubEmojis(): Promise<EmojiItem[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch(emojiDataUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`emoji dataset: HTTP ${res.status}`);
        return res.json() as Promise<EmojiItem[]>;
      })
      .then((data) => {
        cache = data;
        return data;
      })
      .catch((error) => {
        // Allow a later retry instead of caching the failure forever.
        pending = null;
        log.warn('[emoji-data] failed to load emoji dataset', error);
        return [] as EmojiItem[];
      });
  }
  return pending;
}

export function getGitHubEmojis(): EmojiItem[] {
  if (!cache) {
    log.warn('[emoji-data] getGitHubEmojis() called before load — emoji list is empty');
  }
  return cache ?? [];
}

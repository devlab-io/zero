import { Clock, Plus } from '@/components/icons/icons';

/**
 * Section vitesse — maquette de composeur HONNÊTE (raccourcis réellement
 * présents dans l'app : ⏎ envoyer, ↓↑ naviguer, Z annuler). Aucun contrôle
 * inventé, aucune promesse IA, tokens clair/sombre, zéro animation.
 */

const shortcuts = [
  { keys: ['↓', '↑'], label: 'to navigate' },
  { keys: ['⏎'], label: 'to send' },
  { keys: ['Z'], label: 'to undo' },
] as const;

export function HomeReplyMockup() {
  return (
    <section aria-labelledby="keyboard-heading" className="relative mt-32 px-4 md:mt-40">
      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-1 items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="text-lg font-light text-zinc-600 md:text-xl dark:text-zinc-200">
            Designed for people who live in their inbox
          </p>
          <h2
            id="keyboard-heading"
            className="mt-3 text-balance text-4xl font-medium tracking-[-0.03em] text-zinc-950 md:text-5xl dark:text-white"
          >
            <span className="block">Triage at typing speed</span>
            <span className="block">reply without leaving the keyboard</span>
          </h2>
          <p className="mt-5 max-w-xl text-base font-normal leading-7 text-zinc-600 dark:text-zinc-200">
            Open, archive, reply and move to the next thread with the shortcuts shown in the
            product. Undo remains available when the underlying email action supports it.
          </p>
        </div>

        <div
          role="img"
          aria-label="Reply composer illustrating recipients, subject, attachment and keyboard shortcuts"
          className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-[#2A2A2A] dark:bg-[#1A1A1A]"
        >
          <div aria-hidden="true">
            <div className="flex h-12 items-center gap-2 border-b border-zinc-100 px-4 dark:border-[#252525]">
              <span className="text-sm text-zinc-400 dark:text-zinc-500">To:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {['Adam', 'Ryan'].map((name) => (
                  <span
                    key={name}
                    className="flex items-center gap-1.5 rounded-full border border-zinc-200 py-0.5 pl-2 pr-2.5 text-sm text-zinc-800 dark:border-[#2B2B2B] dark:text-zinc-200"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex h-11 items-center gap-2.5 border-b border-zinc-100 px-4 dark:border-[#252525]">
              <Clock className="size-3.5 shrink-0 fill-zinc-400" />
              <p className="truncate text-sm text-zinc-800 dark:text-zinc-200">
                Re: Code review feedback
              </p>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm leading-normal text-zinc-800 dark:text-zinc-200">
              <p>Hey team,</p>
              <p>
                I took a look at the review feedback. The keyboard navigation makes everything much
                faster to reach, and the search implementation is clean — send the preview link and
                I&rsquo;ll test it this afternoon.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <span className="flex h-8 items-center gap-2 rounded-md bg-zinc-900 px-2.5 text-sm text-white dark:bg-white dark:text-zinc-900">
                  Send now
                  <kbd className="flex h-5 items-center rounded bg-white/20 px-1.5 text-xs font-semibold dark:bg-zinc-900/10">
                    ⏎
                  </kbd>
                </span>
                <span className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 text-sm text-zinc-600 dark:border-[#373737] dark:text-zinc-400">
                  <Plus className="size-2.5 fill-current" />
                  Add files
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 divide-y divide-zinc-100 border-t border-zinc-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-[#252525] dark:border-[#252525]">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label}
                  className="flex h-12 flex-1 items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400"
                >
                  <span className="flex items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-zinc-100 px-1 text-xs font-semibold text-zinc-600 dark:bg-[#2B2B2B] dark:text-[#8C8C8C]"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                  {shortcut.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { phraseBank, rankCandidates, type PredictionLocale } from '@/lib/compose-prediction';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState } from '@tiptap/pm/state';
import { emailPhrases } from './email-phrases';
import { Extension } from '@tiptap/core';
import { log } from '@/lib/log';
import './ghost-text.css';

export interface SenderInfo {
  name?: string;
  email?: string;
}

export interface EmailSuggestions {
  openers?: string[];
  closers?: string[];
  custom?: string[];
  commonPhrases?: string[];
  timeBased?: string[];
  contextBased?: string[];
}

export interface AutoCompleteOptions {
  enabled?: boolean;
  suggestions: EmailSuggestions;
  sender?: SenderInfo;
  myInfo?: SenderInfo;
  /** Langue de la banque déterministe (P7) — 'en' par défaut. */
  locale?: PredictionLocale;
  context?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    dayOfWeek?: string;
    previousEmails?: string[];
  };
}

/**
 * Ghost text de complétion (P7) — NON-MUTANT : la suggestion n'existe que
 * comme décoration ; seul un Tab explicite insère le texte, jamais de
 * remplacement silencieux. Le classement est délégué au moteur pur
 * lib/compose-prediction (banque fr/en déterministe + phrases legacy des
 * options). L'état « phrases utilisées » vit par instance d'éditeur — et
 * l'éditeur est remonté par owner (ComposerOwnerGate, clé userId:connectionId)
 * — donc rien ne traverse comptes ou brouillons.
 */
export const AutoComplete = Extension.create<AutoCompleteOptions>({
  name: 'ghostText',

  addProseMirrorPlugins() {
    if (this.options.enabled === false) return [];
    const key = new PluginKey('ghostText');
    const options = this.options;

    const usedSuggestions = new Set<string>();

    // Banque construite UNE fois par instance (options figées au configure).
    const bank: string[] = [
      ...phraseBank(options.locale ?? 'en', {
        senderName: options.sender?.name,
        myName: options.myInfo?.name,
      }),
      ...(options.suggestions?.openers ?? []),
      ...(options.suggestions?.closers ?? []),
      ...(options.suggestions?.custom ?? []),
      ...(options.suggestions?.commonPhrases ?? []),
      ...emailPhrases.custom,
    ];

    const findSuggestion = (currentLine: string, fullText: string): string | null =>
      rankCandidates(bank, { currentLine, fullText }, usedSuggestions);

    const currentLineAt = (state: EditorState, pos: number): string => {
      const lineStart = state.doc.resolve(pos).start();
      return state.doc.textBetween(lineStart, pos, '\n', '\0');
    };

    return [
      new Plugin({
        key,
        props: {
          handleKeyDown(view, event) {
            if (event.key !== 'Tab') return false;

            const { state } = view;
            const { selection } = state;
            if (!(selection instanceof TextSelection) || !selection.$cursor) {
              return false;
            }

            const pos = selection.$cursor.pos;
            const currentLine = currentLineAt(state, pos);
            if (!currentLine) return false;

            const suggestion = findSuggestion(currentLine, state.doc.textContent);
            if (!suggestion) return false;

            const remainingText = suggestion.slice(currentLine.length);
            if (!remainingText) return false;

            event.preventDefault();

            try {
              const tr = state.tr;
              tr.insertText(remainingText, pos);
              view.dispatch(tr);
              usedSuggestions.add(suggestion);
              return true;
            } catch (error) {
              log.error('Error applying suggestion:', error);
              return false;
            }
          },
          decorations: (state) => {
            const { doc, selection } = state;
            if (!(selection instanceof TextSelection) || !selection.$cursor) {
              return DecorationSet.empty;
            }

            const pos = selection.$cursor.pos;
            const currentLine = currentLineAt(state, pos);
            if (!currentLine) return DecorationSet.empty;

            const suggestion = findSuggestion(currentLine, doc.textContent);
            if (!suggestion) return DecorationSet.empty;

            const remainingText = suggestion.slice(currentLine.length);
            if (!remainingText) return DecorationSet.empty;

            const decoration = Decoration.widget(pos, () => {
              const span = document.createElement('span');
              span.textContent = remainingText;
              span.className = 'ghost-text-suggestion';
              // Purement décoratif pour les lecteurs d'écran — l'acceptation
              // reste un geste explicite (Tab).
              span.setAttribute('aria-hidden', 'true');
              return span;
            });

            return DecorationSet.create(doc, [decoration]);
          },
        },
      }),
    ];
  },
});

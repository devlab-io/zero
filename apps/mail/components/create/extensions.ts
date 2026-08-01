// NOTE perf: we intentionally do NOT import from 'novel' here. novel's dist is a single
// non-tree-shakable bundle whose unused Mathematics node retains katex (~257 kB) in the
// client build. Everything below is imported straight from the underlying @tiptap
// packages; the few novel-specific helpers (AIHighlight, CustomKeymap, UpdatedImage,
// UploadImagesPlugin, markdown-style HorizontalRule input rule, the pre-configured
// Placeholder) are inlined 1:1 from novel@1.0.2 (Apache-2.0) so behavior is unchanged.
import {
  Extension,
  InputRule,
  Mark,
  markInputRule,
  markPasteRule,
  mergeAttributes,
} from '@tiptap/core';
import TiptapHorizontalRule from '@tiptap/extension-horizontal-rule';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';
import CharacterCount from '@tiptap/extension-character-count';
import TiptapPlaceholder from '@tiptap/extension-placeholder';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import TiptapUnderline from '@tiptap/extension-underline';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import TextStyle from '@tiptap/extension-text-style';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import Highlight from '@tiptap/extension-highlight';
import TiptapImage from '@tiptap/extension-image';
import { Color } from '@tiptap/extension-color';
import TiptapLink from '@tiptap/extension-link';
import { cx } from 'class-variance-authority';
import StarterKit from '@tiptap/starter-kit';

// --- Inlined from novel: AIHighlight mark ---
const AI_HIGHLIGHT_INPUT_REGEX = /(?:^|\s)((?:==)((?:[^~=]+))(?:==))$/;
const AI_HIGHLIGHT_PASTE_REGEX = /(?:^|\s)((?:==)((?:[^~=]+))(?:==))/g;

const AIHighlight = Mark.create({
  name: 'ai-highlight',
  addOptions() {
    return { HTMLAttributes: {} };
  },
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-color') || (element as HTMLElement).style.backgroundColor,
        renderHTML: (attributes) =>
          attributes.color
            ? {
                'data-color': attributes.color,
                style: `background-color: ${attributes.color}; color: inherit`,
              }
            : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setAIHighlight:
        (attributes?: { color: string }) =>
        ({ commands }: { commands: any }) =>
          commands.setMark(this.name, attributes),
      toggleAIHighlight:
        (attributes?: { color: string }) =>
        ({ commands }: { commands: any }) =>
          commands.toggleMark(this.name, attributes),
      unsetAIHighlight:
        () =>
        ({ commands }: { commands: any }) =>
          commands.unsetMark(this.name),
    } as any;
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-h': () => (this.editor.commands as any).toggleAIHighlight(),
    };
  },
  addInputRules() {
    return [markInputRule({ find: AI_HIGHLIGHT_INPUT_REGEX, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: AI_HIGHLIGHT_PASTE_REGEX, type: this.type })];
  },
});

// --- Inlined from novel: CustomKeymap (Mod-A selects within node boundaries first) ---
const CustomKeymap = Extension.create({
  name: 'CustomKeymap',
  addCommands() {
    return {
      selectTextWithinNodeBoundaries:
        () =>
        ({ editor, commands }: { editor: any; commands: any }) => {
          const { state } = editor;
          const { tr } = state;
          const startNodePos = tr.selection.$from.start();
          const endNodePos = tr.selection.$to.end();
          return commands.setTextSelection({ from: startNodePos, to: endNodePos });
        },
    } as any;
  },
  addKeyboardShortcuts() {
    return {
      'Mod-a': ({ editor }) => {
        const { state } = editor;
        const { tr } = state;
        const startSelectionPos = tr.selection.from;
        const endSelectionPos = tr.selection.to;
        const startNodePos = tr.selection.$from.start();
        const endNodePos = tr.selection.$to.end();
        const isCurrentTextSelectionNotExtendedToNodeBoundaries =
          startSelectionPos > startNodePos || endSelectionPos < endNodePos;
        if (isCurrentTextSelectionNotExtendedToNodeBoundaries) {
          (editor.chain() as any).selectTextWithinNodeBoundaries().run();
          return true;
        }
        return false;
      },
    };
  },
});

// --- Inlined from novel: UpdatedImage (image node with width/height attributes) ---
const UpdatedImage = TiptapImage.extend({
  name: 'image',
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
    };
  },
});

// --- Inlined from novel: UploadImagesPlugin (placeholder decorations while uploading) ---
const uploadKey = new PluginKey('upload-image');

const UploadImagesPlugin = ({ imageClass }: { imageClass: string }) =>
  new Plugin({
    key: uploadKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, set) {
        set = set.map(tr.mapping, tr.doc);
        const action = tr.getMeta(uploadKey);
        if (action?.add) {
          const { id, pos, src } = action.add;
          const placeholderEl = document.createElement('div');
          placeholderEl.setAttribute('class', 'img-placeholder');
          const image = document.createElement('img');
          image.setAttribute('class', imageClass);
          image.src = src;
          placeholderEl.appendChild(image);
          const deco = Decoration.widget(pos + 1, placeholderEl, { id });
          set = set.add(tr.doc, [deco]);
        } else if (action?.remove) {
          set = set.remove(set.find(undefined, undefined, (spec) => spec.id == action.remove.id));
        }
        return set;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });

// --- Inlined from novel: pre-configured Placeholder ---
const Placeholder = TiptapPlaceholder.configure({
  placeholder: ({ node }) =>
    node.type.name === 'heading' ? `Heading ${node.attrs.level}` : "Press '/' for commands",
  includeChildren: true,
});

// --- Inlined from novel: HighlightExtension (multicolor) ---
const HighlightExtension = Highlight.configure({ multicolor: true });

// --- Inlined from novel: HorizontalRule with markdown-style input rule ---
const HorizontalRule = TiptapHorizontalRule.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /^(?:---|—-|___\s|\*\*\*\s)$/u,
        handler: ({ state, range }) => {
          const attributes = {};
          const { tr } = state;
          const start = range.from;
          const end = range.to;
          tr.insert(start - 1, this.type.create(attributes)).delete(
            tr.mapping.map(start),
            tr.mapping.map(end),
          );
        },
      }),
    ];
  },
});

//TODO I am using cx here to get tailwind autocomplete working, idk if someone else can write a regex to just capture the class key in objects
const aiHighlight = AIHighlight;
//You can overwrite the placeholder with your own configuration
const placeholder = Placeholder;

// Create a separate extension to handle exiting links on space
const ExitLinkOnSpace = Extension.create({
  name: 'exitLinkOnSpace',
  addKeyboardShortcuts() {
    return {
      Space: ({ editor }) => {
        if (editor.isActive('link')) {
          // Insert a space character first
          editor.commands.insertContent(' ');

          // Then explicitly unset the link mark
          editor.commands.unsetLink();

          return true;
        }
        return false;
      },
    };
  },
});

// Configure the link extension with standard options
const tiptapLink = TiptapLink.configure({
  HTMLAttributes: {
    class: cx(
      'text-muted-foreground underline underline-offset-[3px] hover:text-primary transition-colors cursor-pointer',
    ),
  },
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  protocols: ['http', 'https', 'mailto', 'tel'],
});

const tiptapImage = TiptapImage.extend({
  addProseMirrorPlugins() {
    return [
      UploadImagesPlugin({
        imageClass: cx('opacity-40 rounded-lg border border-stone-200'),
      }),
    ];
  },
}).configure({
  allowBase64: true,
  HTMLAttributes: {
    class: cx('rounded-lg border border-muted'),
  },
});

const updatedImage = UpdatedImage.configure({
  HTMLAttributes: {
    class: cx('rounded-lg border border-muted'),
  },
});

const taskList = TaskList.configure({
  HTMLAttributes: {
    class: cx('not-prose pl-2 '),
  },
});

const taskItem = TaskItem.configure({
  HTMLAttributes: {
    class: cx('flex gap-2 items-start my-4'),
  },
  nested: true,
});

const horizontalRule = HorizontalRule.configure({
  HTMLAttributes: {
    class: cx('mt-4 mb-6 border-t border-muted-foreground'),
  },
});

const starterKit = StarterKit.configure({
  bulletList: {
    HTMLAttributes: {
      class: cx('list-disc list-outside leading-2 -mt-2'),
    },
  },
  orderedList: {
    HTMLAttributes: {
      class: cx('list-decimal list-outside leading-2 -mt-2'),
    },
  },
  listItem: {
    HTMLAttributes: {
      class: cx('leading-normal -mb-2'),
    },
  },
  blockquote: {
    HTMLAttributes: {
      class: cx('my-3 border-l-2 border-muted-foreground/40 pl-3 text-muted-foreground'),
      style: 'border-left: 3px solid #d1d5db; margin: 12px 0; padding-left: 12px; color: #4b5563;',
    },
  },
  heading: {
    levels: [1, 2, 3],
    HTMLAttributes: {
      class: cx('text-primary'),
    },
  },
  codeBlock: {
    HTMLAttributes: {
      class: cx('rounded-md bg-muted text-muted-foreground border p-5 font-mono font-medium'),
    },
  },
  code: {
    HTMLAttributes: {
      class: cx('rounded-md bg-muted  px-1.5 py-1 font-mono font-medium'),
      spellcheck: 'false',
    },
  },
  horizontalRule: false,
  dropcursor: {
    color: '#DBEAFE',
    width: 4,
  },
  gapcursor: false,
});

const characterCount = CharacterCount.configure();

export const defaultExtensions = [
  starterKit,
  placeholder,
  tiptapLink,
  ExitLinkOnSpace, // Add our custom extension to exit links on space
  tiptapImage,
  updatedImage,
  taskList,
  taskItem,
  horizontalRule,
  aiHighlight,
  characterCount,
  TiptapUnderline,
  HighlightExtension,
  TextStyle,
  Color,
  CustomKeymap,
  GlobalDragHandle,
];

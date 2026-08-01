import {
  Bold,
  Italic,
  Strikethrough,
  Underline,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
  TextQuote,
  Link2,
  Unlink,
  RemoveFormatting,
  Minus,
} from 'lucide-react';

import { TooltipContent, TooltipProvider, TooltipTrigger, Tooltip } from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { normalizeComposerLink } from '@/lib/composer-link';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Button } from '../ui/button';

import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { m } from '@/paraglide/messages';
import { toast } from 'sonner';

function LinkToolbarButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');

  const openLinkEditor = useCallback(() => {
    setHref((editor.getAttributes('link').href as string | undefined) ?? '');
    setOpen(true);
  }, [editor]);

  useEffect(() => {
    const dom = editor.view.dom;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (editor.state.selection.empty && !editor.isActive('link')) return;
        event.preventDefault();
        openLinkEditor();
      }
    };
    dom.addEventListener('keydown', handleKeyDown);
    return () => dom.removeEventListener('keydown', handleKeyDown);
  }, [editor, openLinkEditor]);

  const applyLink = () => {
    const normalized = normalizeComposerLink(href);
    if (!normalized) {
      toast.error('Enter a valid link');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run();
    setOpen(false);
  };

  const isActive = editor.isActive('link');
  const canCreateLink = isActive || !editor.state.selection.empty;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) openLinkEditor();
        else setOpen(false);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              tabIndex={-1}
              variant="ghost"
              size="icon"
              disabled={!canCreateLink}
              aria-label="Add or edit link"
              className={`h-auto w-auto rounded p-1.5 ${isActive ? 'bg-muted' : 'bg-background'}`}
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Add link (⌘K)</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" side="top" className="w-72 p-3">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <label htmlFor="composer-link" className="text-xs font-medium">
            Link
          </label>
          <Input
            id="composer-link"
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="https://example.com"
            autoFocus
            className="h-9"
          />
          <div className="flex items-center justify-between gap-2">
            {isActive ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  setOpen(false);
                }}
              >
                <Unlink className="size-3.5" />
                Remove
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export const Toolbar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) return null;

  return (
    <div className="bg-background flex max-w-full gap-1 overflow-x-auto rounded-lg border p-1 text-sm shadow-sm">
      <TooltipProvider>
        <div className="control-group">
          <div className="button-group ml-0 flex flex-nowrap items-center gap-1">
            <div className="mr-2 flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    className={`bg-muted disabled:bg-background h-auto w-auto rounded p-1.5`}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                    className={`bg-muted disabled:bg-background h-auto w-auto rounded p-1.5`}
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo</TooltipContent>
              </Tooltip>
            </div>

            <div className="mr-2 flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('heading', { level: 1 }) ? 'bg-muted' : 'bg-background'}`}
                  >
                    <Heading1 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>H1</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('heading', { level: 2 }) ? 'bg-muted' : 'bg-background'}`}
                  >
                    <Heading2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>H2</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('heading', { level: 3 }) ? 'bg-muted' : 'bg-background'}`}
                  >
                    <Heading3 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>H3</TooltipContent>
              </Tooltip>
            </div>
            <Separator orientation="vertical" className="relative right-1 top-0.5 h-6" />
            <div className="mr-2 flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    disabled={!editor.can().chain().focus().toggleBold().run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('bold') ? 'bg-muted font-medium' : 'bg-background'}`}
                    title="Bold"
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{m['pages.createEmail.editor.menuBar.bold']()}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    disabled={!editor.can().chain().focus().toggleItalic().run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('italic') ? 'bg-muted' : 'bg-background'}`}
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{m['pages.createEmail.editor.menuBar.italic']()}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    disabled={!editor.can().chain().focus().toggleStrike().run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('strike') ? 'bg-muted' : 'bg-background'}`}
                  >
                    <Strikethrough className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {m['pages.createEmail.editor.menuBar.strikethrough']()}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('underline') ? 'bg-muted' : 'bg-background'}`}
                  >
                    <Underline className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{m['pages.createEmail.editor.menuBar.underline']()}</TooltipContent>
              </Tooltip>
              <LinkToolbarButton editor={editor} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                    className="bg-background h-auto w-auto rounded p-1.5"
                  >
                    <RemoveFormatting className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear formatting</TooltipContent>
              </Tooltip>
            </div>

            <Separator orientation="vertical" className="relative right-1 top-0.5 h-6" />

            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('bulletList') ? 'bg-muted' : 'bg-background'}`}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {m['pages.createEmail.editor.menuBar.bulletList']()}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('orderedList') ? 'bg-muted' : 'bg-background'}`}
                  >
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {m['pages.createEmail.editor.menuBar.orderedList']()}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    className={`h-auto w-auto rounded p-1.5 ${editor.isActive('blockquote') ? 'bg-muted' : 'bg-background'}`}
                  >
                    <TextQuote className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Block Quote</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon"
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    className="bg-background h-auto w-auto rounded p-1.5"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Divider</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
};

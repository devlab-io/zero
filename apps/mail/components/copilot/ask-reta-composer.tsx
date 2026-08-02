import {
  ASK_RETA_DEFAULT_PROMPTS,
  loadAskRetaSavedPrompts,
  saveAskRetaSavedPrompts,
  type AskRetaSavedPrompt,
} from '@/lib/ask-reta-saved-prompts';
import { extractAskRetaAttachments, type AskRetaAttachment } from '@/lib/ask-reta-attachments';
import { BookMarked, FileText, LoaderCircle, Paperclip, Plus, Send, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { toast } from 'sonner';

type AskRetaComposerProps = {
  question: string;
  onQuestionChange: (value: string) => void;
  attachments: AskRetaAttachment[];
  onAttachmentsChange: (attachments: AskRetaAttachment[]) => void;
  userId?: string;
  connectionId?: string;
  disabled: boolean;
  asking: boolean;
  onSubmit: () => void;
  onStop: () => void;
};

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function AskRetaComposer({
  question,
  onQuestionChange,
  attachments,
  onAttachmentsChange,
  userId,
  connectionId,
  disabled,
  asking,
  onSubmit,
  onStop,
}: AskRetaComposerProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [creatingPrompt, setCreatingPrompt] = useState(false);
  const [promptSearch, setPromptSearch] = useState('');
  const [promptTitle, setPromptTitle] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [customPrompts, setCustomPrompts] = useState<AskRetaSavedPrompt[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCustomPrompts(userId && connectionId ? loadAskRetaSavedPrompts(userId, connectionId) : []);
    setPromptOpen(false);
    setCreatingPrompt(false);
  }, [userId, connectionId]);

  const allPrompts = useMemo(
    () => [...customPrompts, ...ASK_RETA_DEFAULT_PROMPTS],
    [customPrompts],
  );
  const filteredPrompts = useMemo(() => {
    const search = promptSearch.trim().toLocaleLowerCase();
    if (!search) return allPrompts;
    return allPrompts.filter((prompt) =>
      `${prompt.title} ${prompt.content}`.toLocaleLowerCase().includes(search),
    );
  }, [allPrompts, promptSearch]);

  const persistCustomPrompts = (next: AskRetaSavedPrompt[]) => {
    setCustomPrompts(next);
    if (userId && connectionId) saveAskRetaSavedPrompts(userId, connectionId, next);
  };

  const choosePrompt = (prompt: AskRetaSavedPrompt) => {
    onQuestionChange(prompt.content);
    setPromptOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const savePrompt = () => {
    const content = (promptContent || question).trim();
    const title = promptTitle.trim();
    if (!title || !content) return;
    persistCustomPrompts([
      {
        id: crypto.randomUUID(),
        title: title.slice(0, 80),
        content: content.slice(0, 2_000),
        createdAt: Date.now(),
      },
      ...customPrompts,
    ]);
    setPromptTitle('');
    setPromptContent('');
    setCreatingPrompt(false);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const result = await extractAskRetaAttachments(files, attachments);
    if (result.accepted.length) onAttachmentsChange([...attachments, ...result.accepted]);
    if (result.rejected.length) {
      toast.error(m['common.askReta.attachmentsRejected']({ count: result.rejected.length }));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <form
      className="border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (question.trim() && !asking && !disabled) onSubmit();
      }}
    >
      {attachments.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={m['common.askReta.attachments']()}>
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="bg-muted flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-xs"
            >
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-48 truncate">{attachment.name}</span>
              <span className="text-muted-foreground">{formatSize(attachment.size)}</span>
              <button
                type="button"
                className="hover:bg-background rounded-full p-0.5"
                aria-label={m['common.askReta.removeAttachment']({ name: attachment.name })}
                onClick={() =>
                  onAttachmentsChange(attachments.filter((item) => item.id !== attachment.id))
                }
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-border/70 bg-background focus-within:ring-ring/30 rounded-xl border shadow-sm transition-shadow focus-within:ring-2">
        <Textarea
          ref={textareaRef}
          value={question}
          disabled={disabled}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' && !question.trim()) {
              event.preventDefault();
              setPromptOpen(true);
            } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (question.trim() && !asking) onSubmit();
            }
          }}
          placeholder={m['common.askReta.placeholder']()}
          aria-label={m['common.askReta.placeholder']()}
          className="max-h-44 min-h-24 resize-none border-0 bg-transparent px-3 pb-1 pt-3 shadow-none focus-visible:ring-0"
          autoFocus
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            accept=".txt,.text,.md,.markdown,.csv,.tsv,.json,.html,.xml,.yaml,.yml,.log,.rtf,text/*,application/json,application/xml,application/rtf"
            onChange={(event) => void addFiles(event.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            disabled={disabled || asking}
            aria-label={m['common.askReta.addAttachment']()}
            title={m['common.askReta.addAttachmentHint']()}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>

          <Popover open={promptOpen} onOpenChange={setPromptOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                disabled={disabled}
                aria-label={m['common.askReta.savedPrompts']()}
                title={m['common.askReta.savedPromptsHint']()}
              >
                <BookMarked className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="top"
              className="w-[min(360px,calc(100vw-24px))] p-0"
            >
              <div className="flex items-center justify-between border-b px-3 py-2.5">
                <p className="text-sm font-medium">{m['common.askReta.savedPrompts']()}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={m['common.askReta.addSavedPrompt']()}
                  onClick={() => {
                    setCreatingPrompt((value) => !value);
                    setPromptContent(question);
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
              {creatingPrompt && (
                <div className="space-y-2 border-b p-3">
                  <Input
                    value={promptTitle}
                    onChange={(event) => setPromptTitle(event.target.value)}
                    placeholder={m['common.askReta.promptTitle']()}
                    className="h-9"
                  />
                  <Textarea
                    value={promptContent}
                    onChange={(event) => setPromptContent(event.target.value)}
                    placeholder={m['common.askReta.promptContent']()}
                    className="min-h-20 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreatingPrompt(false)}
                    >
                      {m['common.actions.cancel']()}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!promptTitle.trim() || !(promptContent || question).trim()}
                      onClick={savePrompt}
                    >
                      {m['common.actions.save']()}
                    </Button>
                  </div>
                </div>
              )}
              <Input
                value={promptSearch}
                onChange={(event) => setPromptSearch(event.target.value)}
                placeholder={m['common.askReta.searchSavedPrompts']()}
                className="m-2 h-9 w-[calc(100%-16px)]"
              />
              <ul className="max-h-64 overflow-y-auto p-1.5">
                {filteredPrompts.map((prompt) => {
                  const custom = !prompt.id.startsWith('default:');
                  return (
                    <li key={prompt.id} className="group flex items-center gap-1">
                      <button
                        type="button"
                        className="hover:bg-muted min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left"
                        onClick={() => choosePrompt(prompt)}
                      >
                        <span className="block truncate text-sm font-medium">{prompt.title}</span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {prompt.content}
                        </span>
                      </button>
                      {custom && (
                        <button
                          type="button"
                          className="hover:bg-muted text-muted-foreground size-8 rounded-md opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={m['common.askReta.deleteSavedPrompt']({
                            title: prompt.title,
                          })}
                          onClick={() =>
                            persistCustomPrompts(
                              customPrompts.filter((item) => item.id !== prompt.id),
                            )
                          }
                        >
                          <X className="mx-auto size-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground ml-auto hidden text-[11px] sm:inline">
            {m['common.askReta.composerHint']()}
          </span>
          {asking ? (
            <Button type="button" size="sm" variant="outline" className="h-9" onClick={onStop}>
              <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
              {m['common.askReta.stop']()}
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="size-9 rounded-lg"
              disabled={!question.trim() || disabled}
              aria-label={m['common.askReta.send']()}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {!question.trim() && attachments.length === 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {ASK_RETA_DEFAULT_PROMPTS.slice(0, 3).map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              className="hover:bg-muted rounded-full border px-2.5 py-1 text-xs transition-colors"
              onClick={() => choosePrompt(prompt)}
            >
              {prompt.title}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

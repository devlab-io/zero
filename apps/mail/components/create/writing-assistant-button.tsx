import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, LoaderCircle, WandSparkles } from 'lucide-react';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Editor } from '@tiptap/react';
import { useState } from 'react';
import { log } from '@/lib/log';
import { toast } from 'sonner';

const MOOD_SUGGESTIONS = ['Concise', 'Warm', 'Direct', 'Professional'];

export function WritingAssistantButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState('');
  const trpc = useTRPC();
  const rewrite = useMutation(trpc.ai.rewriteEmail.mutationOptions());

  const applyRewrite = async (mode: 'correct' | 'rewrite', requestedMood?: string) => {
    if (!editor || editor.isDestroyed) return;

    const sourceHtml = editor.getHTML();
    if (!editor.getText().trim()) {
      toast.error('Write something first');
      return;
    }
    if (sourceHtml.length > 40_000) {
      toast.error('This draft is too long to rewrite at once');
      return;
    }

    const previousContent = editor.getJSON();

    try {
      const result = await rewrite.mutateAsync({
        content: sourceHtml,
        mode,
        ...(mode === 'rewrite' && requestedMood?.trim() ? { mood: requestedMood.trim() } : {}),
      });

      if (editor.isDestroyed) return;
      if (editor.getHTML() !== sourceHtml) {
        toast.error('The draft changed while rewriting. Try again to keep your latest edits.');
        return;
      }

      editor.commands.setContent(result.html);
      editor.commands.focus('end');
      setOpen(false);

      toast.success(mode === 'correct' ? 'Email corrected' : 'Email reformulated', {
        action: {
          label: 'Undo',
          onClick: () => {
            if (!editor.isDestroyed) editor.commands.setContent(previousContent);
          },
        },
      });
    } catch (error) {
      log.error('Writing assistant failed', error);
      toast.error('Could not rewrite this email');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Writing assistant"
                className="bg-background h-auto w-auto cursor-pointer rounded border p-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-[#404040]"
              >
                {rewrite.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <WandSparkles className="h-4 w-4" />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Correct or reformulate</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent align="start" side="top" sideOffset={8} className="w-80 p-3">
        <div className="mb-3">
          <p className="text-sm font-semibold">Writing assistant</p>
          <p className="text-muted-foreground text-xs">
            Improve the draft without changing its facts.
          </p>
        </div>

        <button
          type="button"
          disabled={rewrite.isPending}
          onClick={() => void applyRewrite('correct')}
          className="hover:bg-accent flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50"
        >
          <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
            <Check className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-medium">Correct</span>
            <span className="text-muted-foreground block text-xs">
              Spelling, grammar and punctuation
            </span>
          </span>
        </button>

        <div className="mt-3 space-y-2">
          <label htmlFor="rewrite-mood" className="text-xs font-medium">
            Reformulate with a mood
          </label>
          <Input
            id="rewrite-mood"
            value={mood}
            disabled={rewrite.isPending}
            onChange={(event) => setMood(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void applyRewrite('rewrite', mood);
              }
            }}
            placeholder="e.g. warm, direct, concise…"
            className="h-9"
          />
          <div className="flex flex-wrap gap-1.5">
            {MOOD_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={rewrite.isPending}
                onClick={() => setMood(suggestion)}
                className="bg-muted text-muted-foreground hover:text-foreground rounded-full px-2 py-1 text-[11px] transition-colors disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={rewrite.isPending}
            onClick={() => void applyRewrite('rewrite', mood)}
          >
            {rewrite.isPending ? 'Reformulating…' : 'Reformulate'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

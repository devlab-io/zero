import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
  NOTE_COLORS,
  getNoteColorClass,
  getNoteColorStyle,
  formatRelativeTime,
  borderToBackgroundColorClass,
} from '@/lib/notes-utils';
import {
  Edit,
  Trash2,
  Copy,
  Clock,
  Pin,
  PinOff,
  GripVertical,
  PaintBucket,
  MoreVertical,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { CSS } from '@dnd-kit/utilities';
import type { Note } from '@/types';
import { cn } from '@/lib/utils';

export function SortableNote({
  note,
  onEdit,
  onCopy,
  onTogglePin,
  onDelete,
  onColorChange,
}: {
  note: Note;
  onEdit: () => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onColorChange: (color: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({
      id: note.id,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative mb-3 overflow-hidden rounded-md border border-[#E7E7E7] p-3 dark:border-[#252525]',
        note.isPinned && 'ring-1 ring-amber-200 dark:ring-amber-800',
        note.color === 'default' ? 'bg-white dark:bg-[#202020]' : '',
      )}
    >
      <div
        className={cn(
          'absolute bottom-0 left-0 top-0 w-1.5 border-l-4',
          note.color !== 'default' ? getNoteColorClass(note.color) : 'border-transparent',
        )}
        style={note.color !== 'default' ? getNoteColorStyle(note.color) : {}}
      />

      <div className="flex items-start gap-3 pl-1.5">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm text-black dark:text-white/90">
            {note.content}
          </p>

          <div className="mt-2 flex cursor-default items-center text-xs text-[#8C8C8C]">
            <Clock className="mr-1 h-3 w-3" />
            <span>{formatRelativeTime(note.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center">
          <div
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="cursor-grab opacity-30 group-hover:opacity-100"
          >
            <GripVertical className="text-muted-foreground h-4 w-4" />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0 opacity-30 group-hover:opacity-100">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="dark:bg-panelDark border-[#E7E7E7] bg-[#FAFAFA] dark:border-[#252525]"
            >
              <DropdownMenuItem
                onClick={onEdit}
                className="text-black focus:bg-white focus:text-black dark:text-white/90 dark:focus:bg-[#202020] dark:focus:text-white"
              >
                <Edit className="mr-2 h-4 w-4" />
                <span>{m['common.notes.actions.edit']()}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onCopy}
                className="text-black focus:bg-white focus:text-black dark:text-white/90 dark:focus:bg-[#202020] dark:focus:text-white"
              >
                <Copy className="mr-2 h-4 w-4" />
                <span>{m['common.notes.actions.copy']()}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onTogglePin}
                className="text-black focus:bg-white focus:text-black dark:text-white/90 dark:focus:bg-[#202020] dark:focus:text-white"
              >
                {note.isPinned ? (
                  <>
                    <PinOff className="mr-2 h-4 w-4" />
                    <span>{m['common.notes.actions.unpin']()}</span>
                  </>
                ) : (
                  <>
                    <Pin className="mr-2 h-4 w-4" />
                    <span>{m['common.notes.actions.pin']()}</span>
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-black focus:bg-white focus:text-black dark:text-white/90 dark:focus:bg-[#202020] dark:focus:text-white">
                  <PaintBucket className="mr-2 h-4 w-4" />
                  <span>{m['common.notes.actions.changeColor']()}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="dark:bg-panelDark w-48 border-[#E7E7E7] bg-[#FAFAFA] dark:border-[#252525]">
                    <DropdownMenuRadioGroup value={note.color} onValueChange={onColorChange}>
                      {NOTE_COLORS.map((color) => {
                        return (
                          <DropdownMenuRadioItem
                            key={color.value}
                            value={color.value}
                            className="text-black focus:bg-white focus:text-black dark:text-white/90 dark:focus:bg-[#202020] dark:focus:text-white"
                          >
                            <div className="flex items-center">
                              <div
                                className={cn(
                                  'mr-2 h-3 w-3 rounded-full',
                                  color.value !== 'default'
                                    ? borderToBackgroundColorClass(color.class)
                                    : 'border-border border bg-transparent',
                                )}
                              />
                              <span>{color.label}</span>
                            </div>
                          </DropdownMenuRadioItem>
                        );
                      })}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSeparator className="bg-[#E7E7E7] dark:bg-[#252525]" />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-600 focus:bg-white focus:text-red-600 dark:text-red-400 dark:focus:bg-[#202020] dark:focus:text-red-400"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>{m['common.notes.actions.delete']()}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

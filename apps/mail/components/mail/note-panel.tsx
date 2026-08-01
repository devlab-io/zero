import { StickyNote, X, PlusCircle, Search, AlertCircle, Pin } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { NOTE_COLORS, getNoteColorStyle } from '@/lib/notes-utils';
import { SortableNote } from './note-panel-sortable-note';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useNotesPanel } from './note-panel-logic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { cn } from '@/lib/utils';

interface NotesPanelProps {
  threadId: string;
}

export function NotesPanel({ threadId }: NotesPanelProps) {
  const {
    notes,
    isOpen,
    setIsOpen,
    editingNoteId,
    setEditingNoteId,
    newNoteContent,
    setNewNoteContent,
    editContent,
    setEditContent,
    isAddingNewNote,
    setIsAddingNewNote,
    searchQuery,
    setSearchQuery,
    selectedColor,
    setSelectedColor,
    activeId,
    textareaRef,
    panelRef,
    sensors,
    handlePanelClick,
    handleAddNote,
    handleKeyDown,
    handleEditNote,
    startEditing,
    confirmDeleteNote,
    handleCopyNote,
    togglePinNote,
    handleChangeNoteColor,
    handleDragStart,
    handleDragEnd,
    filteredNotes,
    sortedPinnedNotes,
    sortedUnpinnedNotes,
    pinnedIds,
    unpinnedIds,
  } = useNotesPanel(threadId);

  return (
    <div className="relative" ref={panelRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center gap-1 overflow-hidden rounded-lg bg-white dark:bg-[#313131]',
              notes.length > 0 && 'text-amber-500',
              isOpen && 'bg-white/80 dark:bg-[#313131]/80',
            )}
            onClick={() => setIsOpen(!isOpen)}
          >
            <StickyNote
              className={cn(
                'h-4 w-4',
                notes.length > 0 ? 'fill-amber-200 dark:fill-amber-900' : 'text-[#9A9A9A]',
              )}
            />
            {notes.length > 0 && (
              <span className="bg-primary text-primary-foreground absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                {notes.length}
              </span>
            )}
            <span className="sr-only">{m['common.notes.title']()}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-white dark:bg-[#313131]">
          <p>{m['common.notes.noteCount']({ count: notes.length })}</p>
        </TooltipContent>
      </Tooltip>

      {isOpen && (
        <div
          className="animate-in fade-in-20 zoom-in-95 dark:bg-panelDark max-w-screen fixed top-20 z-50 h-[calc(100dvh-5rem)] max-h-[calc(100dvh-5rem)] w-full overflow-hidden rounded-t-lg border border-t bg-[#FAFAFA] shadow-lg duration-100 sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:h-auto sm:max-h-[80vh] sm:w-[350px] sm:max-w-[90vw] sm:rounded-xl sm:border lg:left-[-200px] xl:left-[-300px] dark:border-[#252525]"
          onClick={handlePanelClick}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E7E7E7] p-3 dark:border-[#252525]">
            <h3 className="flex items-center text-sm font-medium text-black dark:text-white">
              <StickyNote className="mr-2 h-4 w-4" />
              {m['common.notes.title']()}{' '}
              {notes.length > 0 && (
                <Badge variant="outline" className="ml-2">
                  {notes.length}
                </Badge>
              )}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 rounded-md p-0 hover:bg-white/10"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4 fill-[#9A9A9A]" />
              <span className="sr-only">{m['common.actions.close']()}</span>
            </Button>
          </div>

          {notes.length > 0 && (
            <div className="sticky top-[49px] z-10 px-3 pb-0 pt-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-[#9A9A9A]" />
                <Input
                  placeholder={m['common.notes.search']()}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-[#E7E7E7] bg-white pl-8 text-sm text-black placeholder:text-[#797979] focus:outline-none dark:border-[#252525] dark:bg-[#202020] dark:text-white"
                />
              </div>
            </div>
          )}

          <div className="flex h-full flex-col sm:max-h-[calc(80vh-100px)]">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <ScrollArea className="flex-1 overflow-y-auto">
                <div className="p-3">
                  {notes.length === 0 && !isAddingNewNote ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <StickyNote className="mb-2 h-12 w-12 text-[#8C8C8C] opacity-50" />
                      <p className="text-sm text-black dark:text-white/90">
                        {m['common.notes.empty']()}
                      </p>
                      <p className="mb-4 mt-1 max-w-[80%] text-xs text-[#8C8C8C]">
                        {m['common.notes.emptyDescription']()}
                      </p>
                      <Button
                        variant="default"
                        size="xs"
                        className="mt-1"
                        onClick={() => setIsAddingNewNote(true)}
                      >
                        <PlusCircle className="mr-1 h-4 w-4" />
                        {m['common.notes.addNote']()}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {searchQuery && filteredNotes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <AlertCircle className="mb-2 h-10 w-10 text-[#8C8C8C] opacity-50" />
                          <p className="text-sm text-black dark:text-white/90">
                            {m['common.notes.noMatchingNotes']({ query: searchQuery })}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4 border-[#E7E7E7] bg-white text-black dark:border-[#252525] dark:bg-[#313131] dark:text-white/90"
                            onClick={() => setSearchQuery('')}
                          >
                            {m['common.notes.clearSearch']()}
                          </Button>
                        </div>
                      ) : (
                        <>
                          {sortedPinnedNotes.length > 0 && (
                            <div className="mb-3">
                              <div className="mb-2 flex items-center">
                                <Pin className="mr-1 h-3 w-3 text-amber-500" />
                                <span className="text-muted-foreground text-xs font-medium">
                                  {m['common.notes.pinnedNotes']()}
                                </span>
                              </div>

                              <SortableContext
                                items={pinnedIds}
                                strategy={verticalListSortingStrategy}
                              >
                                {sortedPinnedNotes.map((note) => (
                                  <SortableNote
                                    key={note.id}
                                    note={note}
                                    onEdit={() => startEditing(note)}
                                    onCopy={() => handleCopyNote(note.content)}
                                    onTogglePin={() => togglePinNote(note.id, !!note.isPinned)}
                                    onDelete={() => confirmDeleteNote(note.id)}
                                    onColorChange={(color) => handleChangeNoteColor(note.id, color)}
                                  />
                                ))}
                              </SortableContext>
                            </div>
                          )}

                          {sortedUnpinnedNotes.length > 0 && (
                            <div>
                              {sortedPinnedNotes.length > 0 && sortedUnpinnedNotes.length > 0 && (
                                <div className="mb-2 flex items-center">
                                  <span className="text-muted-foreground text-xs font-medium">
                                    {m['common.notes.otherNotes']()}
                                  </span>
                                </div>
                              )}

                              <SortableContext
                                items={unpinnedIds}
                                strategy={verticalListSortingStrategy}
                              >
                                {sortedUnpinnedNotes.map((note) => (
                                  <SortableNote
                                    key={note.id}
                                    note={note}
                                    onEdit={() => startEditing(note)}
                                    onCopy={() => handleCopyNote(note.content)}
                                    onTogglePin={() => togglePinNote(note.id, !!note.isPinned)}
                                    onDelete={() => confirmDeleteNote(note.id)}
                                    onColorChange={(color) => handleChangeNoteColor(note.id, color)}
                                  />
                                ))}
                              </SortableContext>
                            </div>
                          )}
                        </>
                      )}

                      {isAddingNewNote && (
                        <div
                          className={cn(
                            'relative mb-3 overflow-hidden rounded-md border bg-[#FFFFFF] dark:bg-[#202020]',
                            selectedColor === 'default'
                              ? 'border-[#E7E7E7] dark:border-[#252525]'
                              : 'bg-muted/30 dark:bg-muted/20',
                          )}
                          style={
                            selectedColor !== 'default'
                              ? { borderColor: getNoteColorStyle(selectedColor).borderLeftColor }
                              : undefined
                          }
                        >
                          <div>
                            <Textarea
                              ref={textareaRef}
                              value={newNoteContent}
                              onChange={(e) => setNewNoteContent(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, 'add')}
                              className="min-h-[20px] resize-none border-none bg-transparent text-black focus:outline-none dark:text-white/90"
                              placeholder={m['common.notes.addYourNote']()}
                            />

                            <div className="mt-2 flex flex-wrap items-center justify-between gap-y-2 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[#8C8C8C]">
                                  {m['common.notes.label']()}
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {NOTE_COLORS.map((color) => (
                                    <Tooltip key={color.value}>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => setSelectedColor(color.value)}
                                          className={cn(
                                            'h-5 w-5 rounded-full',
                                            color.value === 'default' ? 'bg-background border' : '',
                                            color.value === 'red' ? 'bg-red-500' : '',
                                            color.value === 'orange' ? 'bg-orange-500' : '',
                                            color.value === 'yellow' ? 'bg-amber-500' : '',
                                            color.value === 'green' ? 'bg-green-500' : '',
                                            color.value === 'blue' ? 'bg-blue-500' : '',
                                            color.value === 'purple' ? 'bg-purple-500' : '',
                                            color.value === 'pink' ? 'bg-pink-500' : '',
                                            selectedColor === color.value &&
                                              'ring-primary ring-2 ring-offset-1',
                                          )}
                                          aria-label={color.label}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="bottom"
                                        className="bg-white dark:bg-[#313131]"
                                      >
                                        {color.label}
                                      </TooltipContent>
                                    </Tooltip>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="mx-1 my-2 flex justify-between">
                              <Button
                                variant="ghost"
                                size="xs"
                                className="text-[#8C8C8C] hover:bg-white/10 hover:text-[#a0a0a0]"
                                onClick={() => {
                                  setIsAddingNewNote(false);
                                  setNewNoteContent('');
                                }}
                              >
                                {m['common.notes.cancel']()}
                              </Button>
                              <Button
                                variant="default"
                                size="xs"
                                onClick={() => void handleAddNote()}
                                disabled={!newNoteContent.trim()}
                              >
                                {m['common.notes.save']()}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {!isAddingNewNote && (
                        <Button
                          variant="outline"
                          size="xs"
                          className="mt-1 w-full border-[#E7E7E7] bg-white/5 hover:bg-white/10 dark:border-[#252525] dark:text-white/90"
                          onClick={() => setIsAddingNewNote(true)}
                        >
                          <PlusCircle className="mr-2 h-4 w-4" />
                          {m['common.notes.addNote']()}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>

              <DragOverlay>
                {activeId ? (
                  <div className="rounded-md border border-[#E7E7E7] bg-white p-3 pl-7 shadow-md dark:border-[#252525] dark:bg-[#202020]">
                    <div className="pl-1.5">
                      <div className="whitespace-pre-wrap break-words text-sm text-black dark:text-white/90">
                        {notes.find((n) => n.id === activeId)?.content}
                      </div>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            {editingNoteId && (
              <div className="dark:bg-panelDark border-t border-[#E7E7E7] bg-[#FAFAFA] p-3 dark:border-[#252525]">
                <div className="space-y-2">
                  <div className="mb-1 text-xs font-medium text-[#8C8C8C]">
                    {m['common.notes.editNote']()}:
                  </div>
                  <Textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'edit')}
                    className="min-h-[100px] resize-none border-[#E7E7E7] bg-[#FFFFFF] text-sm text-black dark:border-[#252525] dark:bg-[#202020] dark:text-white/90"
                    placeholder={m['common.notes.addYourNote']()}
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-[#8C8C8C] hover:bg-white/10 hover:text-[#a0a0a0]"
                      onClick={() => {
                        setEditingNoteId(null);
                        setEditContent('');
                      }}
                    >
                      {m['common.notes.cancel']()}
                    </Button>
                    <Button variant="default" size="xs" onClick={() => void handleEditNote()}>
                      {m['common.actions.saveChanges']()}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  assignOrdersAfterPinnedReorder,
  assignOrdersAfterUnpinnedReorder,
  sortNotesByOrder,
} from '@/lib/notes-utils';
import { useMutation } from '@tanstack/react-query';
import { useThreadNotes } from '@/hooks/use-notes';
import { useTRPC } from '@/providers/query-provider';
import { m } from '@/paraglide/messages';
import type { Note } from '@/types';
import { toast } from 'sonner';

export function useNotesPanel(threadId: string) {
  const {
    data: { notes },
    refetch,
  } = useThreadNotes(threadId);
  const [isOpen, setIsOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isAddingNewNote, setIsAddingNewNote] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColor, setSelectedColor] = useState('default');
  const [activeId, setActiveId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const trpc = useTRPC();
  const { mutateAsync: createNote } = useMutation(trpc.notes.create.mutationOptions());
  const { mutateAsync: updateNote } = useMutation(trpc.notes.update.mutationOptions());
  const { mutateAsync: deleteNote } = useMutation(trpc.notes.delete.mutationOptions());
  const { mutateAsync: reorderNotes } = useMutation(trpc.notes.reorder.mutationOptions());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handlePanelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  useEffect(() => {
    if (isAddingNewNote && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isAddingNewNote]);

  useEffect(() => {
    if (editingNoteId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editingNoteId]);

  const handleAddNote = async () => {
    if (newNoteContent.trim()) {
      const noteData = {
        threadId,
        color: selectedColor !== 'default' ? selectedColor : undefined,
        content: newNoteContent.trim(),
      };

      const promise = async () => {
        setIsAddingNewNote(true);
        await createNote(noteData);
        await refetch();
        setNewNoteContent('');
        setSelectedColor('default');
        setIsAddingNewNote(false);
      };

      toast.promise(promise(), {
        loading: m['common.actions.loading'](),
        success: m['common.notes.noteAdded'](),
        error: m['common.notes.errors.failedToAddNote'](),
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, action: 'add' | 'edit') => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (action === 'add') {
        void handleAddNote();
      } else {
        void handleEditNote();
      }
    }
  };

  const handleEditNote = async () => {
    if (editingNoteId && editContent.trim()) {
      const noteId = editingNoteId;
      const contentToSave = editContent.trim();

      setEditingNoteId(null);
      setEditContent('');

      const promise = async () => {
        await updateNote({
          noteId,
          data: {
            content: contentToSave,
          },
        });
        await refetch();
      };

      toast.promise(promise(), {
        loading: m['common.actions.saving'](),
        success: m['common.notes.noteUpdated'](),
        error: m['common.notes.errors.failedToUpdateNote'](),
      });
    }
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote({ noteId });
      await refetch();
    } catch (error) {
      console.error('Failed to delete note:', error);
      throw error;
    }
  };

  const confirmDeleteNote = (noteId: string) => {
    // TODO: Dialog is bugged? needs to be fixed then implement a confirmation dialog
    const promise = handleDeleteNote(noteId);
    toast.promise(promise, {
      loading: m['common.actions.loading'](),
      success: m['common.notes.noteDeleted'](),
      error: m['common.notes.errors.failedToDeleteNote'](),
    });
  };

  const handleCopyNote = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success(m['common.notes.noteCopied']());
  };

  const togglePinNote = async (noteId: string, isPinned: boolean) => {
    const action = updateNote({
      noteId,
      data: { isPinned: !isPinned },
    });

    toast.promise(action, {
      loading: m['common.actions.loading'](),
      success: isPinned ? m['common.notes.noteUnpinned']() : m['common.notes.notePinned'](),
      error: m['common.notes.errors.failedToUpdateNote'](),
    });

    await action;
    return await refetch();
  };

  const handleChangeNoteColor = async (noteId: string, color: string) => {
    const action = updateNote({
      noteId,
      data: {
        color,
      },
    });

    toast.promise(action, {
      loading: m['common.actions.loading'](),
      success: m['common.notes.colorChanged'](),
      error: m['common.notes.errors.failedToUpdateNoteColor'](),
    });

    await action;
    return await refetch();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const activeNote = notes.find((n) => n.id === active.id);
      const overNote = notes.find((n) => n.id === over.id);

      if (!activeNote || !overNote || activeNote.isPinned !== overNote.isPinned) {
        setActiveId(null);
        return;
      }

      const pinnedNotes = notes.filter((note) => note.isPinned);
      const unpinnedNotes = notes.filter((note) => !note.isPinned);

      if (activeNote.isPinned) {
        const oldIndex = pinnedNotes.findIndex((n) => n.id === active.id);
        const newIndex = pinnedNotes.findIndex((n) => n.id === over.id);
        const newPinnedNotes = arrayMove(pinnedNotes, oldIndex, newIndex);

        const reorderedPinnedNotes = assignOrdersAfterPinnedReorder(newPinnedNotes);

        const newNotes = [...reorderedPinnedNotes, ...unpinnedNotes];
        const action = reorderNotes({ notes: newNotes });

        toast.promise(action, {
          loading: m['common.actions.loading'](),
          success: m['common.notes.notesReordered'](),
          error: m['common.notes.errors.failedToReorderNotes'](),
        });

        await action;
        await refetch();
      } else {
        const oldIndex = unpinnedNotes.findIndex((n) => n.id === active.id);
        const newIndex = unpinnedNotes.findIndex((n) => n.id === over.id);
        const newUnpinnedNotes = arrayMove(unpinnedNotes, oldIndex, newIndex);

        const reorderedUnpinnedNotes = assignOrdersAfterUnpinnedReorder(
          newUnpinnedNotes,
          pinnedNotes.length,
        );

        const newNotes = [...pinnedNotes, ...reorderedUnpinnedNotes];
        const action = reorderNotes({ notes: newNotes });

        toast.promise(action, {
          loading: m['common.actions.loading'](),
          success: m['common.notes.notesReordered'](),
          error: m['common.notes.errors.failedToReorderNotes'](),
        });

        await action;
        await refetch();
      }
    }

    setActiveId(null);
  };

  const filteredNotes = useMemo(
    () => notes.filter((note) => note.content.toLowerCase().includes(searchQuery.toLowerCase())),
    [notes, searchQuery],
  );

  const pinnedNotes = useMemo(() => filteredNotes.filter((note) => note.isPinned), [filteredNotes]);

  const unpinnedNotes = useMemo(
    () => filteredNotes.filter((note) => !note.isPinned),
    [filteredNotes],
  );

  const sortedPinnedNotes = useMemo(() => sortNotesByOrder(pinnedNotes), [pinnedNotes]);

  const sortedUnpinnedNotes = useMemo(() => sortNotesByOrder(unpinnedNotes), [unpinnedNotes]);

  const pinnedIds = useMemo(() => sortedPinnedNotes.map((note) => note.id), [sortedPinnedNotes]);

  const unpinnedIds = useMemo(
    () => sortedUnpinnedNotes.map((note) => note.id),
    [sortedUnpinnedNotes],
  );

  return {
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
  };
}

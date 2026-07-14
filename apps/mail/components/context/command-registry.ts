import {
  Calendar as CalendarIcon,
  FileText,
  Filter,
  Info,
  Mail,
  Paperclip,
  Search,
  Star,
  Tag,
  User,
  Users,
} from 'lucide-react';
import { Pencil2 } from '../icons/icons';
import type { ComponentType } from 'react';

/**
 * Command registry — machine-readable, data-only surface of the command palette.
 *
 * This module is intentionally free of JSX and React state so it can be imported
 * and unit-tested in isolation, and so #32 (Shortwave keyboard parity) can consume
 * a single source of truth for the palette's commands, key aliases and scopes.
 * Rendering and behaviour wiring live in the palette component / view modules.
 */

export type CommandIcon = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

export interface CommandItem {
  title: string;
  icon?: CommandIcon;
  url?: string;
  onClick?: () => unknown;
  shortcut?: string;
  isBackButton?: boolean;
  disabled?: boolean;
  keywords?: string[];
  description?: string;
}

export interface FilterOption {
  id: string;
  name: string;
  keywords: string[];
  action: (...args: string[]) => string;
  requiresInput?: boolean;
  icon?: CommandIcon;
}

export interface ActiveFilter {
  id: string;
  type: string;
  value: string;
  display: string;
}

/** A rendered group in the command list. */
export interface CommandGroupData {
  group: string;
  items: CommandItem[];
}

/** Minimal thread shape consumed by the search view's quick results. */
export interface QuickSearchThread {
  id?: string;
  subject?: string;
  sender?: { name?: string; email?: string } | null;
  snippet?: string;
}

/** Minimal label shape consumed by the labels view (loose superset of useLabels). */
export interface PaletteLabel {
  id?: string | null;
  name?: string | null;
  color?: { backgroundColor?: string | null } | null;
}

export type CommandView = 'main' | 'search' | 'filter' | 'dateRange' | 'labels' | 'help';

/**
 * Declarative target for a static palette command. The palette component maps it
 * to a concrete handler; the registry stays behaviour-agnostic.
 */
export type PaletteCommandTarget = { kind: 'compose' } | { kind: 'view'; view: CommandView };

export interface PaletteCommand {
  id: string;
  title: string;
  icon: CommandIcon;
  /** Single-key alias handled while the palette is closed (parity registry for #32). */
  shortcut?: string;
  /** Command-list group the item renders under. */
  group: 'mail' | 'search' | 'help';
  /** Contextual scope for the keyboard-parity registry. */
  scope: string;
  target: PaletteCommandTarget;
}

/**
 * Static command surface of the palette (the non-navigation commands). Order is
 * significant: it is the render order inside each group.
 */
export const PALETTE_COMMANDS: PaletteCommand[] = [
  {
    id: 'compose',
    title: 'Compose Email',
    icon: Pencil2,
    shortcut: 'c',
    group: 'mail',
    scope: 'command-palette',
    target: { kind: 'compose' },
  },
  {
    id: 'search',
    title: 'Search Emails',
    icon: Search,
    shortcut: 's',
    group: 'search',
    scope: 'command-palette',
    target: { kind: 'view', view: 'search' },
  },
  {
    id: 'filter',
    title: 'Filter Emails',
    icon: Filter,
    shortcut: 'f',
    group: 'search',
    scope: 'command-palette',
    target: { kind: 'view', view: 'filter' },
  },
  {
    id: 'help',
    title: 'Filter Syntax Help',
    icon: Info,
    group: 'help',
    scope: 'command-palette',
    target: { kind: 'view', view: 'help' },
  },
];

/** Titles of commands that switch to an in-palette view (palette stays open on select). */
export const IN_PALETTE_VIEW_COMMAND_TITLES = PALETTE_COMMANDS.filter(
  (c) => c.group === 'search' && c.target.kind === 'view',
).map((c) => c.title);

/**
 * Meta shortcuts handled while the palette is open (and the mod+k trigger). Data
 * only — the keydown handler in the palette component owns the actual bindings;
 * this drives the in-palette help UI and is the seam #32 renders help/settings from.
 */
export interface PaletteTriggerKey {
  display: string;
  label: string;
  scope: string;
}

export const PALETTE_TRIGGER_KEYS: PaletteTriggerKey[] = [
  { display: '⌘K', label: 'Open command palette', scope: 'global' },
  { display: '⌘F', label: 'Open filters (when palette is open)', scope: 'command-palette' },
  { display: '⌘S', label: 'Open search (when palette is open)', scope: 'command-palette' },
  { display: '⌘L', label: 'Open labels (when palette is open)', scope: 'command-palette' },
  { display: 'ESC', label: 'Go back / Close', scope: 'command-palette' },
];

/** Filter definitions used by the filter/labels/builder views and quick filters. */
export const FILTER_OPTIONS: FilterOption[] = [
  {
    id: 'from',
    name: 'From',
    keywords: ['sender', 'from', 'author', 'sent by'],
    action: (currentSearch: string) => `from:${currentSearch}`,
    requiresInput: true,
    icon: User,
  },
  {
    id: 'to',
    name: 'To',
    keywords: ['recipient', 'to', 'receiver', 'sent to'],
    action: (currentSearch: string) => `to:${currentSearch}`,
    requiresInput: true,
    icon: Users,
  },
  {
    id: 'subject',
    name: 'Subject',
    keywords: ['title', 'subject', 'about', 'regarding'],
    action: (currentSearch: string) => `subject:"${currentSearch}"`,
    requiresInput: true,
    icon: FileText,
  },
  {
    id: 'has:attachment',
    name: 'Has Attachment',
    keywords: ['attachment', 'file', 'document', 'attached'],
    action: () => 'has:attachment',
    icon: Paperclip,
  },
  {
    id: 'is:starred',
    name: 'Is Starred',
    keywords: ['starred', 'favorite', 'important', 'star'],
    action: () => 'is:starred',
    icon: Star,
  },
  {
    id: 'is:unread',
    name: 'Is Unread',
    keywords: ['unread', 'new', 'unopened', 'not read'],
    action: () => 'is:unread',
    icon: Mail,
  },
  {
    id: 'after',
    name: 'After Date',
    keywords: ['date', 'after', 'since', 'newer than'],
    action: (currentSearch: string) => `after:${currentSearch}`,
    requiresInput: true,
    icon: CalendarIcon,
  },
  {
    id: 'before',
    name: 'Before Date',
    keywords: ['date', 'before', 'until', 'older than'],
    action: (currentSearch: string) => `before:${currentSearch}`,
    requiresInput: true,
    icon: CalendarIcon,
  },
  {
    id: 'between',
    name: 'Date Range',
    keywords: ['between', 'date range', 'from to', 'period'],
    action: (...args: string[]) => `after:${args[0]} before:${args[1]}`,
    requiresInput: true,
    icon: CalendarIcon,
  },
  {
    id: 'has:label',
    name: 'Has Label',
    keywords: ['label', 'tag', 'category', 'labeled'],
    action: (currentSearch: string) => `label:${currentSearch}`,
    requiresInput: true,
    icon: Tag,
  },
];

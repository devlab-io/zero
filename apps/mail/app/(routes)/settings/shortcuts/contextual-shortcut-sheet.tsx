import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type Shortcut, keyboardShortcuts } from '@/config/shortcuts';
import { formatDisplayKeys } from '@/lib/hotkeys/use-hotkey-utils';
import { m } from '@/paraglide/messages';

const actionLabels: Record<string, () => string> = {
  approveSelected: m['pages.settings.shortcuts.actions.approveSelected'],
  archive: m['pages.settings.shortcuts.actions.archive'],
  archiveEmail: m['pages.settings.shortcuts.actions.archiveEmail'],
  archiveNext: m['pages.settings.shortcuts.actions.archiveNext'],
  bulkDelete: m['pages.settings.shortcuts.actions.bulkDelete'],
  bulkStar: m['pages.settings.shortcuts.actions.bulkStar'],
  clearAllFilters: m['pages.settings.shortcuts.actions.clearAllFilters'],
  closeCompose: m['pages.settings.shortcuts.actions.closeCompose'],
  closeList: m['pages.settings.shortcuts.actions.closeList'],
  closeView: m['pages.settings.shortcuts.actions.closeView'],
  commandPalette: m['pages.settings.shortcuts.actions.commandPalette'],
  delete: m['pages.settings.shortcuts.actions.delete'],
  exitSelectionMode: m['pages.settings.shortcuts.actions.exitSelectionMode'],
  focusNext: m['pages.settings.shortcuts.actions.focusNext'],
  focusPrevious: m['pages.settings.shortcuts.actions.focusPrevious'],
  forward: m['pages.settings.shortcuts.actions.forward'],
  forwardThread: m['pages.settings.shortcuts.actions.forwardThread'],
  goToArchive: m['pages.settings.shortcuts.actions.goToArchive'],
  goToBin: m['pages.settings.shortcuts.actions.goToBin'],
  goToDrafts: m['pages.settings.shortcuts.actions.goToDrafts'],
  goToSettings: m['pages.settings.shortcuts.actions.goToSettings'],
  goToSnoozed: m['pages.settings.shortcuts.actions.goToSnoozed'],
  goToSpam: m['pages.settings.shortcuts.actions.goToSpam'],
  goToStarred: m['pages.settings.shortcuts.actions.goToStarred'],
  helpWithShortcuts: m['pages.settings.shortcuts.actions.helpWithShortcuts'],
  inbox: m['pages.settings.shortcuts.actions.inbox'],
  markAsImportant: m['pages.settings.shortcuts.actions.markAsImportant'],
  markAsNotImportant: m['pages.settings.shortcuts.actions.markAsNotImportant'],
  markAsRead: m['pages.settings.shortcuts.actions.markAsRead'],
  markAsUnread: m['pages.settings.shortcuts.actions.markAsUnread'],
  newEmail: m['pages.settings.shortcuts.actions.newEmail'],
  openFocused: m['pages.settings.shortcuts.actions.openFocused'],
  openLabels: m['pages.settings.shortcuts.actions.openLabels'],
  openMove: m['pages.settings.shortcuts.actions.openMove'],
  openSelected: m['pages.settings.shortcuts.actions.openSelected'],
  pageDown: m['pages.settings.shortcuts.actions.pageDown'],
  pageUp: m['pages.settings.shortcuts.actions.pageUp'],
  rejectSelected: m['pages.settings.shortcuts.actions.rejectSelected'],
  remind: m['pages.settings.shortcuts.actions.remind'],
  remindThread: m['pages.settings.shortcuts.actions.remindThread'],
  reply: m['pages.settings.shortcuts.actions.reply'],
  replyAll: m['pages.settings.shortcuts.actions.replyAll'],
  replyAllToThread: m['pages.settings.shortcuts.actions.replyAllToThread'],
  replyToThread: m['pages.settings.shortcuts.actions.replyToThread'],
  search: m['pages.settings.shortcuts.actions.search'],
  selectAll: m['pages.settings.shortcuts.actions.selectAll'],
  sendAndArchive: m['pages.settings.shortcuts.actions.sendAndArchive'],
  sendEmail: m['pages.settings.shortcuts.actions.sendEmail'],
  sentMail: m['pages.settings.shortcuts.actions.sentMail'],
  toggleFocusedSelection: m['pages.settings.shortcuts.actions.toggleFocusedSelection'],
  toggleSidebar: m['pages.settings.shortcuts.actions.toggleSidebar'],
  toggleStar: m['pages.settings.shortcuts.actions.toggleStar'],
  toggleTheme: m['pages.settings.shortcuts.actions.toggleTheme'],
  undoLastAction: m['pages.settings.shortcuts.actions.undoLastAction'],
};

function actionLabel(action: string): string {
  const label = actionLabels[action];
  if (!label) {
    throw new Error(`Missing contextual shortcut label for action: ${action}`);
  }
  return label();
}

function ShortcutRows({ shortcuts }: { shortcuts: Shortcut[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {shortcuts.map((shortcut) => (
        <div key={`${shortcut.scope}-${shortcut.action}-${shortcut.keys.join('-')}`} className="bg-popover text-muted-foreground flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
          <span className="font-medium" data-shortcut-action={shortcut.action}>{actionLabel(shortcut.action)}</span>
          <div className="flex select-none gap-1">
            {formatDisplayKeys(shortcut.keys).map((key) => (
              <kbd key={key} className="border-muted-foreground/10 bg-accent h-6 rounded-[6px] border px-1.5 font-mono text-xs leading-6">
                {key}
              </kbd>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContextualShortcutSheet({ open, onOpenChange, activeScopes }: { open: boolean; onOpenChange: (open: boolean) => void; activeScopes: string[] }) {
  const shortcuts = keyboardShortcuts.filter((shortcut) => activeScopes.includes(shortcut.scope));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showOverlay className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m['pages.settings.shortcuts.title']()}</DialogTitle>
          <DialogDescription>{m['pages.settings.shortcuts.description']()}</DialogDescription>
        </DialogHeader>
        <ShortcutRows shortcuts={shortcuts} />
      </DialogContent>
    </Dialog>
  );
}

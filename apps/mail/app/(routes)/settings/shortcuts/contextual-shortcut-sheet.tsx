import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type Shortcut, keyboardShortcuts } from '@/config/shortcuts';
import { formatDisplayKeys } from '@/lib/hotkeys/use-hotkey-utils';
import { m } from '@/paraglide/messages';

const actionLabels: Record<string, () => string> = {
  newEmail: m['pages.settings.shortcuts.actions.newEmail'],
  search: m['pages.settings.shortcuts.actions.search'],
  commandPalette: m['pages.settings.shortcuts.actions.commandPalette'],
  helpWithShortcuts: m['pages.settings.shortcuts.actions.helpWithShortcuts'],
  goToSettings: m['pages.settings.shortcuts.actions.goToSettings'],
  undoLastAction: m['pages.settings.shortcuts.actions.undoLastAction'],
  clearAllFilters: m['pages.settings.shortcuts.actions.clearAllFilters'],
  markAsImportant: m['pages.settings.shortcuts.actions.markAsImportant'],
  markAsUnread: m['pages.settings.shortcuts.actions.markAsUnread'],
  bulkDelete: m['pages.settings.shortcuts.actions.bulkDelete'],
  bulkStar: m['pages.settings.shortcuts.actions.bulkStar'],
  replyToThread: m['pages.settings.shortcuts.actions.replyToThread'],
  replyAllToThread: m['pages.settings.shortcuts.actions.replyAllToThread'],
  forwardThread: m['pages.settings.shortcuts.actions.forwardThread'],
  remindThread: m['pages.settings.shortcuts.actions.remindThread'],
  archive: m['pages.settings.shortcuts.actions.archive'],
  remind: m['pages.settings.shortcuts.actions.remind'],
  reply: m['pages.settings.shortcuts.actions.reply'],
  replyAll: m['pages.settings.shortcuts.actions.replyAll'],
  forward: m['pages.settings.shortcuts.actions.forward'],
  delete: m['pages.settings.shortcuts.actions.delete'],
  goToSpam: m['pages.settings.shortcuts.actions.goToSpam'],
  goToArchive: m['pages.settings.shortcuts.actions.goToArchive'],
  goToBin: m['pages.settings.shortcuts.actions.goToBin'],
  inbox: m['pages.settings.shortcuts.actions.inbox'],
  sentMail: m['pages.settings.shortcuts.actions.sentMail'],
  goToDrafts: m['pages.settings.shortcuts.actions.goToDrafts'],
  closeCompose: m['pages.settings.shortcuts.actions.closeCompose'],
  sendEmail: m['pages.settings.shortcuts.actions.sendEmail'],
};

function actionLabel(action: string): string {
  return actionLabels[action]?.() ?? action;
}

function ShortcutRows({ shortcuts }: { shortcuts: Shortcut[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {shortcuts.map((shortcut) => (
        <div key={`${shortcut.scope}-${shortcut.action}-${shortcut.keys.join('-')}`} className="bg-popover text-muted-foreground flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
          <span className="font-medium">{actionLabel(shortcut.action)}</span>
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

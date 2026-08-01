import { SettingsCard } from '@/components/settings/settings-card';
import { formatDisplayKeys } from '@/lib/hotkeys/use-hotkey-utils';
import { useShortcutCache } from '@/lib/hotkeys/use-hotkey-utils';
import { useCategorySettings } from '@/hooks/use-categories';
import { type Shortcut } from '@/config/shortcuts';
import { m } from '@/paraglide/messages';
import { type ReactNode } from 'react';

// Literal lookups keep the paraglide catalog tree-shakable (no dynamic `m[...]` access).
const actionLabels: Record<string, () => string> = {
  newEmail: m['pages.settings.shortcuts.actions.newEmail'],
  askRetaThread: m['pages.settings.shortcuts.actions.askRetaThread'],
  askRetaOpen: m['pages.settings.shortcuts.actions.askRetaOpen'],
  sendEmail: m['pages.settings.shortcuts.actions.sendEmail'],
  reply: m['pages.settings.shortcuts.actions.reply'],
  replyAll: m['pages.settings.shortcuts.actions.replyAll'],
  forward: m['pages.settings.shortcuts.actions.forward'],
  drafts: m['pages.settings.shortcuts.actions.drafts'],
  inbox: m['pages.settings.shortcuts.actions.inbox'],
  sentMail: m['pages.settings.shortcuts.actions.sentMail'],
  delete: m['pages.settings.shortcuts.actions.delete'],
  search: m['pages.settings.shortcuts.actions.search'],
  markAsUnread: m['pages.settings.shortcuts.actions.markAsUnread'],
  muteThread: m['pages.settings.shortcuts.actions.muteThread'],
  printEmail: m['pages.settings.shortcuts.actions.printEmail'],
  archiveEmail: m['pages.settings.shortcuts.actions.archiveEmail'],
  markAsSpam: m['pages.settings.shortcuts.actions.markAsSpam'],
  moveToFolder: m['pages.settings.shortcuts.actions.moveToFolder'],
  undoLastAction: m['pages.settings.shortcuts.actions.undoLastAction'],
  viewEmailDetails: m['pages.settings.shortcuts.actions.viewEmailDetails'],
  goToDrafts: m['pages.settings.shortcuts.actions.goToDrafts'],
  expandEmailView: m['pages.settings.shortcuts.actions.expandEmailView'],
  helpWithShortcuts: m['pages.settings.shortcuts.actions.helpWithShortcuts'],
  recordHotkey: m['pages.settings.shortcuts.actions.recordHotkey'],
  pressKeys: m['pages.settings.shortcuts.actions.pressKeys'],
  releaseKeys: m['pages.settings.shortcuts.actions.releaseKeys'],
  selectAll: m['pages.settings.shortcuts.actions.selectAll'],
  commandPalette: m['pages.settings.shortcuts.actions.commandPalette'],
  markAsRead: m['pages.settings.shortcuts.actions.markAsRead'],
  exitSelectionMode: m['pages.settings.shortcuts.actions.exitSelectionMode'],
  closeCompose: m['pages.settings.shortcuts.actions.closeCompose'],
  goToSpam: m['pages.settings.shortcuts.actions.goToSpam'],
  goToArchive: m['pages.settings.shortcuts.actions.goToArchive'],
  goToBin: m['pages.settings.shortcuts.actions.goToBin'],
  scrollDown: m['pages.settings.shortcuts.actions.scrollDown'],
  scrollUp: m['pages.settings.shortcuts.actions.scrollUp'],
  goToSettings: m['pages.settings.shortcuts.actions.goToSettings'],
  showImportant: m['pages.settings.shortcuts.actions.showImportant'],
  showAllMail: m['pages.settings.shortcuts.actions.showAllMail'],
  showPersonal: m['pages.settings.shortcuts.actions.showPersonal'],
  showUpdates: m['pages.settings.shortcuts.actions.showUpdates'],
  showPromotions: m['pages.settings.shortcuts.actions.showPromotions'],
  showUnread: m['pages.settings.shortcuts.actions.showUnread'],
  selectUnderCursor: m['pages.settings.shortcuts.actions.selectUnderCursor'],
  openVoice: m['pages.settings.shortcuts.actions.openVoice'],
  clearAllFilters: m['pages.settings.shortcuts.actions.clearAllFilters'],
  markAsImportant: m['pages.settings.shortcuts.actions.markAsImportant'],
  markAsUnimportant: m['pages.settings.shortcuts.actions.markAsUnimportant'],
  bulkDelete: m['pages.settings.shortcuts.actions.bulkDelete'],
  bulkSelect: m['pages.settings.shortcuts.actions.bulkSelect'],
  bulkArchive: m['pages.settings.shortcuts.actions.bulkArchive'],
  bulkStar: m['pages.settings.shortcuts.actions.bulkStar'],
  replyToThread: m['pages.settings.shortcuts.actions.replyToThread'],
  replyAllToThread: m['pages.settings.shortcuts.actions.replyAllToThread'],
  forwardThread: m['pages.settings.shortcuts.actions.forwardThread'],
  remindThread: m['pages.settings.shortcuts.actions.remindThread'],
  archive: m['pages.settings.shortcuts.actions.archive'],
  remind: m['pages.settings.shortcuts.actions.remind'],
};

const actionLabel = (shortcut: Shortcut): string =>
  actionLabels[shortcut.action]?.() ?? shortcut.description;

export default function ShortcutsPage() {
  const {
    shortcuts,
    // TODO: Implement shortcuts syncing and caching
    // updateShortcut,
  } = useShortcutCache();
  const categorySettings = useCategorySettings();

  return (
    <div className="grid gap-6">
      <SettingsCard
        title={m['pages.settings.shortcuts.title']()}
        description={m['pages.settings.shortcuts.description']()}
        // footer={
        //   <div className="flex gap-4">
        //     <Button
        //       variant="outline"
        //       onClick={async () => {
        //         try {
        //           await Promise.all(keyboardShortcuts.map((shortcut) => updateShortcut(shortcut)));
        //           toast.success('Shortcuts reset to defaults');
        //         } catch (error) {
        //           toast.error('Failed to reset shortcuts');
        //         }
        //       }}
        //     >
        //       {t('common.actions.resetToDefaults')}
        //     </Button>
        //   </div>
        // }
      >
        <div className="grid max-w-3xl gap-6">
          {Object.entries(
            shortcuts.reduce<Record<string, Shortcut[]>>((acc, shortcut) => {
              const scope = shortcut.scope;
              if (!acc[scope]) acc[scope] = [];
              acc[scope].push(shortcut);
              return acc;
            }, {}),
          ).map(([scope, scopedShortcuts]) => (
            <div key={scope}>
              <h3 className="mb-4 text-lg font-semibold capitalize">
                {scope.split('-').join(' ')}
              </h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {scopedShortcuts.map((shortcut, index) => {
                  const categoryActionIndex: Record<string, number> = {
                    showImportant: 0,
                    showAllMail: 1,
                    showPersonal: 2,
                    showUpdates: 3,
                    showPromotions: 4,
                    showUnread: 5,
                  };

                  let label: string;

                  if (shortcut.action in categoryActionIndex && categorySettings.length) {
                    const idx = categoryActionIndex[shortcut.action];
                    const cat = categorySettings[idx];
                    label = cat ? `Show ${cat.name}` : actionLabel(shortcut);
                  } else {
                    label = actionLabel(shortcut);
                  }

                  return (
                    <ShortcutItem
                      key={`${scope}-${index}`}
                      keys={shortcut.keys}
                      //   action={shortcut.action}
                    >
                      {label}
                    </ShortcutItem>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}

function ShortcutItem({ children, keys }: { children: ReactNode; keys: string[] }) {
  // const [isRecording, setIsRecording] = useState(false);
  const displayKeys = formatDisplayKeys(keys);

  // const { updateShortcut } = useShortcutCache(session?.user?.id);

  // const handleHotkeyRecorded = async (newKeys: string[]) => {
  //   try {
  //     // Find the original shortcut to preserve its type and description
  //     const originalShortcut = keyboardShortcuts.find((s) => s.action === action);
  //     if (!originalShortcut) {
  //       throw new Error('Original shortcut not found');
  //     }

  //     const updatedShortcut: Shortcut = {
  //       ...originalShortcut,
  //       keys: newKeys,
  //     };

  //     await updateShortcut(updatedShortcut);
  //     toast.success('Shortcut saved successfully');
  //   } catch (error) {
  //     toast.error('Failed to save shortcut');
  //   }
  // };

  return (
    <>
      <div
        className="bg-popover text-muted-foreground hover:bg-accent/50 flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2 text-sm"
        // onClick={() => setIsRecording(true)}
        role="button"
        tabIndex={0}
      >
        <span className="font-medium">{children}</span>
        <div className="flex select-none gap-1">
          {displayKeys.map((key) => (
            <kbd
              key={key}
              className="border-muted-foreground/10 bg-accent h-6 rounded-[6px] border px-1.5 font-mono text-xs leading-6"
            >
              {key}
            </kbd>
          ))}
        </div>
      </div>
      {/* <HotkeyRecorder
        isOpen={isRecording}
        onClose={() => setIsRecording(false)}
        onHotkeyRecorded={handleHotkeyRecorded}
        currentKeys={keys}
      /> */}
    </>
  );
}

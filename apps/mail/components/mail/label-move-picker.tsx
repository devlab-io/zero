import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { disarmOpeningKeyGuard, shouldSuppressOpeningKey } from '@/lib/hotkeys/opening-key-guard';
import { availableMoveDestinations, isLabelOnThread } from './label-move-picker.logic';
import { useOptimisticActions } from '@/hooks/use-optimistic-actions';
import { useMail } from '@/components/mail/use-mail';
import useMoveTo from '@/hooks/driver/use-move-to';
import { useThread } from '@/hooks/use-threads';
import { useLabels } from '@/hooks/use-labels';
import { useParams } from 'react-router';
import { Check } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useMemo } from 'react';

/**
 * Label (`l`) / move (`v`) picker for the open thread — the Shortwave-parity pickers for
 * issue #32. It is driven entirely by the `picker` query-state that the `l`/`v` shortcuts
 * set (thread-display-hotkeys.tsx) and reads the thread id + folder itself, so mounting it
 * is a single self-contained line in thread-display.tsx. Labels stay open for multi-toggle;
 * a move applies and closes.
 */
export function LabelMovePicker() {
  const [picker, setPicker] = useQueryState('picker');
  const [threadId] = useQueryState('threadId');
  const params = useParams<{ folder: string }>();
  const folder = params?.folder ?? 'inbox';

  // P5 : la sélection MULTIPLE prime sur le fil ouvert — le même picker sert
  // la BulkActionBar (bulkSelected) et les raccourcis l/v du fil unique.
  const [mail] = useMail();
  const bulkIds = mail.bulkSelected;
  const targetIds = useMemo(
    () => (bulkIds.length > 0 ? bulkIds : threadId ? [threadId] : []),
    [bulkIds, threadId],
  );
  const isBulk = bulkIds.length > 0;

  const { userLabels } = useLabels();
  const { data: thread } = useThread(picker === 'labels' && !isBulk ? (threadId ?? null) : null);
  const { optimisticToggleLabel } = useOptimisticActions();
  const { mutate: moveTo } = useMoveTo();

  const threadLabelIds = useMemo(
    () => new Set((thread?.latest?.tags ?? []).map((tag) => tag.id)),
    [thread?.latest?.tags],
  );

  const isOpen = (picker === 'labels' || picker === 'move') && targetIds.length > 0;
  const close = () => setPicker(null);

  // CUA round 3 : défense en profondeur contre l'écho de la touche d'ouverture
  // (l/v) dans le combo — une vraie frappe émet son keydown ici et désarme la
  // garde ; l'écho arrive sans keydown et est absorbé au beforeinput.
  const guardProps = {
    onKeyDownCapture: () => disarmOpeningKeyGuard(),
    onBeforeInputCapture: (event: React.FormEvent) => {
      const data = (event.nativeEvent as InputEvent).data;
      if (data && shouldSuppressOpeningKey(data)) event.preventDefault();
    },
  };

  if (!isOpen || targetIds.length === 0) return null;

  if (picker === 'move') {
    return (
      <CommandDialog open onOpenChange={(next) => !next && close()}>
        <div {...guardProps}>
          <CommandInput placeholder="Move to…" />
          <CommandList>
            <CommandEmpty>No destinations.</CommandEmpty>
            <CommandGroup heading="Move to">
              {availableMoveDestinations(folder).map((destination) => (
                <CommandItem
                  key={destination.id}
                  value={destination.label}
                  onSelect={() => {
                    moveTo({
                      threadIds: targetIds,
                      currentFolder: folder,
                      destination: destination.id,
                    });
                    close();
                  }}
                >
                  {destination.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </div>
      </CommandDialog>
    );
  }

  return (
    <CommandDialog open onOpenChange={(next) => !next && close()}>
      <div {...guardProps}>
        <CommandInput placeholder="Toggle a label…" />
        <CommandList>
          <CommandEmpty>No labels.</CommandEmpty>
          <CommandGroup heading="Labels">
            {userLabels.map((label) => {
              // Bulk : pas d'état « déjà posé » agrégé fiable — le toggle est
              // ADDITIF (pose le label sur toute la sélection), coche masquée.
              const isOn = !isBulk && isLabelOnThread(threadLabelIds, label.id);
              return (
                <CommandItem
                  key={label.id}
                  value={label.name}
                  onSelect={() => optimisticToggleLabel(targetIds, label.id, !isOn)}
                >
                  <Check className={`mr-2 h-4 w-4 ${isOn ? 'opacity-100' : 'opacity-0'}`} />
                  {label.name}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </div>
    </CommandDialog>
  );
}

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  buildSnoozePresets,
  formatSnoozePreview,
  isValidTimeZone,
  resolveSnoozeExpression,
  type SnoozePresetId,
} from '@/lib/snooze-date';
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Clock3,
  MoonStar,
  Sunrise,
  SunMedium,
  TimerReset,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toZonedTime } from 'date-fns-tz';
import { toast } from 'sonner';

type SnoozeDialogProps = {
  onConfirm: (wakeAt: Date) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const pad = (value: number) => value.toString().padStart(2, '0');

const toDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const PresetIcon = ({ id }: { id: SnoozePresetId }) => {
  const Icon = {
    'one-hour': TimerReset,
    'later-today': MoonStar,
    'tomorrow-morning': Sunrise,
    'tomorrow-afternoon': SunMedium,
    weekend: CalendarDays,
    'next-week': CalendarRange,
    'one-month': CalendarClock,
  }[id];
  return <Icon className="text-muted-foreground" />;
};

export function SnoozeDialog({ onConfirm, open = false, onOpenChange }: SnoozeDialogProps) {
  const [referenceNow, setReferenceNow] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('08:00');

  // Fuseau IANA du réglage utilisateur (UTC inclus et validé) ; repli sur le
  // fuseau du navigateur seulement si aucun réglage exploitable n'existe.
  const { data: settingsData } = useSettings();
  const effectiveZone = useMemo(() => {
    const zone = settingsData?.settings?.timezone;
    return zone && isValidTimeZone(zone) ? zone : undefined;
  }, [settingsData?.settings?.timezone]);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const tomorrowMorning = buildSnoozePresets(now, effectiveZone).find(
      (preset) => preset.id === 'tomorrow-morning',
    )?.wakeAt;
    const tomorrowWall =
      tomorrowMorning && effectiveZone
        ? toZonedTime(tomorrowMorning, effectiveZone)
        : tomorrowMorning;
    setReferenceNow(now);
    setQuery('');
    setShowCustom(false);
    setDate(toDateInputValue(tomorrowWall ?? now));
    setTime('08:00');
  }, [effectiveZone, open]);

  const presets = useMemo(
    () => buildSnoozePresets(referenceNow, effectiveZone),
    [referenceNow, effectiveZone],
  );
  const parsedResolution = useMemo(
    () => (query.trim() ? resolveSnoozeExpression(query, referenceNow, effectiveZone) : null),
    [query, referenceNow, effectiveZone],
  );
  const parsedDate = parsedResolution?.wakeAt ?? null;
  const customResolution = useMemo(
    () =>
      date && time ? resolveSnoozeExpression(`${date} ${time}`, referenceNow, effectiveZone) : null,
    [date, effectiveZone, referenceNow, time],
  );
  const timeZoneLabel = useMemo(() => {
    if (effectiveZone) return effectiveZone;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'Local time';
    }
  }, [effectiveZone]);

  const confirm = (wakeAt: Date) => {
    if (wakeAt.getTime() <= Date.now()) {
      toast.error('Choose a time in the future.');
      return;
    }
    onConfirm(wakeAt);
    onOpenChange?.(false);
  };

  const confirmCustom = () => {
    // Passe par le même parseur que la saisie naturelle : zone, DST, date
    // future et ajustement d'heure inexistante suivent un contrat unique.
    if (!customResolution) {
      toast.error('Choose a valid date and time.');
      return;
    }
    confirm(customResolution.wakeAt);
  };

  const handleShortcut = (event: React.KeyboardEvent) => {
    if (query || showCustom || !/^[1-7]$/.test(event.key)) return;
    const preset = presets[Number(event.key) - 1];
    if (!preset) return;
    event.preventDefault();
    event.stopPropagation();
    confirm(preset.wakeAt);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div onKeyDownCapture={handleShortcut}>
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Clock3 className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Snooze</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              When should this return to your inbox?
            </p>
          </div>
        </div>

        <div className="border-y">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setShowCustom(false);
            }}
            placeholder="Try “demain 9h”, “in 3 hours” or “Friday 2pm”…"
          />
        </div>

        <CommandList className={showCustom && !query ? 'hidden' : 'max-h-[370px]'}>
          {query.trim() ? (
            parsedDate ? (
              <CommandGroup heading="Natural language">
                <CommandItem
                  value={query}
                  onSelect={() => confirm(parsedDate)}
                  className="min-h-14"
                >
                  <CalendarClock className="text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      Snooze until {formatSnoozePreview(parsedDate, effectiveZone)}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {query}
                      {parsedResolution?.adjusted
                        ? ' — requested time does not exist in this time zone (DST); adjusted as shown'
                        : ''}
                    </p>
                  </div>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            ) : (
              <CommandEmpty>
                <p className="font-medium">I couldn&apos;t understand that time.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Try “demain 9h”, “in 2 days”, “EOD” or “next Monday”.
                </p>
              </CommandEmpty>
            )
          ) : showCustom ? null : (
            <>
              <CommandGroup heading="Smart suggestions">
                {presets.map((preset) => (
                  <CommandItem
                    key={preset.id}
                    value={preset.id}
                    onSelect={() => confirm(preset.wakeAt)}
                    className="min-h-12"
                  >
                    <PresetIcon id={preset.id} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{preset.label}</p>
                      <p className="text-muted-foreground text-xs">
                        {preset.hint} · {formatSnoozePreview(preset.wakeAt, effectiveZone)}
                      </p>
                    </div>
                    <CommandShortcut>{preset.shortcut}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="pick-date-time"
                  onSelect={() => setShowCustom(true)}
                  className="min-h-12"
                >
                  <CalendarClock className="text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">Pick a date and time</p>
                    <p className="text-muted-foreground text-xs">Exact local time</p>
                  </div>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>

        {showCustom && !query && (
          <div className="bg-muted/30 border-t px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Pick a date and time</p>
                <p className="text-muted-foreground text-xs">Set an exact local return time.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowCustom(false)}>
                Back
              </Button>
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <label className="text-muted-foreground text-xs font-medium">
                Date
                <Input
                  className="bg-background mt-1.5"
                  type="date"
                  min={toDateInputValue(referenceNow)}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="text-muted-foreground text-xs font-medium">
                Time
                <Input
                  className="bg-background mt-1.5"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </label>
            </div>
            <Button className="mt-3 w-full" onClick={confirmCustom}>
              Snooze until{' '}
              {customResolution
                ? formatSnoozePreview(customResolution.wakeAt, effectiveZone)
                : 'later'}
            </Button>
          </div>
        )}

        <div className="text-muted-foreground flex items-center justify-between border-t px-5 py-2.5 text-[11px]">
          <span>{timeZoneLabel}</span>
          <span>↑↓ navigate · ↵ select · Esc close</span>
        </div>
      </div>
    </CommandDialog>
  );
}

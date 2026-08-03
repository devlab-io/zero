import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Link2,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCcw,
  Users,
  Video,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { requestCalendarEventsAuthorization } from '@/lib/calendar-authorization';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { calendarDayWindow, defaultEventWindow } from './global-workspace-model';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import { useTRPC } from '@/providers/query-provider';
import { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { zodResolver } from '@/lib/zod-resolver';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { m } from '@/paraglide/messages';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { z } from 'zod';

const eventSchema = z.object({
  title: z.string().trim().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  attendees: z.string(),
  location: z.string(),
  description: z.string(),
  allDay: z.boolean(),
  createMeetLink: z.boolean(),
});
type EventForm = z.infer<typeof eventSchema>;

const eventTones = [
  'border-blue-500/25 bg-blue-500/10 text-blue-950 dark:text-blue-100',
  'border-rose-500/25 bg-rose-500/10 text-rose-950 dark:text-rose-100',
  'border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
  'border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100',
  'border-violet-500/25 bg-violet-500/10 text-violet-950 dark:text-violet-100',
] as const;

function colorIndex(id: string, colorId: string | null) {
  if (colorId) return Number.parseInt(colorId, 10) % eventTones.length;
  return [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % eventTones.length;
}

export function CalendarPane() {
  const trpc = useTRPC();
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const dayWindow = useMemo(() => calendarDayWindow(selectedDate), [selectedDate]);
  const query = useQuery(
    trpc.calendar.listDay.queryOptions(
      { ...dayWindow, timeZone },
      { staleTime: 60_000, placeholderData: (previous) => previous },
    ),
  );
  const events = query.data?.events ?? [];

  const authorize = async () => {
    try {
      const result = await requestCalendarEventsAuthorization(windowLocation());
      if (!result.url) throw new Error('Missing authorization URL');
      window.location.assign(result.url);
    } catch {
      toast.error(m['globalWorkspace.calendar.authorizationFailed']());
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="h-9 min-w-0 justify-start px-2 text-sm font-medium">
              <CalendarDays className="size-4 shrink-0" />
              <span className="truncate">{format(selectedDate, 'EEE, d MMM')}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <CalendarPicker
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(startOfDay(date))}
            />
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={m['globalWorkspace.calendar.previousDay']()}
            onClick={() => setSelectedDate((date) => subDays(date, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={() => setSelectedDate(startOfDay(new Date()))}
          >
            {m['globalWorkspace.calendar.today']()}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={m['globalWorkspace.calendar.nextDay']()}
            onClick={() => setSelectedDate((date) => addDays(date, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={m['globalWorkspace.calendar.create']()}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {query.isPending && !query.data ? (
        <CalendarSkeleton />
      ) : query.isError ? (
        <PanelMessage
          icon={RefreshCcw}
          title={m['globalWorkspace.calendar.unavailable']()}
          action={m['globalWorkspace.retry']()}
          onAction={() => void query.refetch()}
        />
      ) : query.data?.supported === false ? (
        <PanelMessage icon={CalendarDays} title={m['globalWorkspace.calendar.googleOnly']()} />
      ) : query.data?.authorizationRequired ? (
        <PanelMessage
          icon={CalendarDays}
          title={m['globalWorkspace.calendar.connectTitle']()}
          description={m['globalWorkspace.calendar.connectDescription']()}
          action={m['globalWorkspace.calendar.connect']()}
          onAction={() => void authorize()}
        />
      ) : (
        <CalendarDay events={events} />
      )}

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        selectedDate={selectedDate}
        timeZone={timeZone}
        authorizationRequired={Boolean(query.data?.authorizationRequired)}
        onAuthorize={authorize}
      />
    </div>
  );
}

function windowLocation() {
  return typeof window === 'undefined' ? '/mail/inbox' : window.location.href;
}

function CalendarDay({
  events,
}: {
  events: Array<{
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    htmlLink: string | null;
    colorId: string | null;
    start: string;
    end: string;
    allDay: boolean;
    attendeeCount: number;
  }>;
}) {
  const allDay = events.filter((event) => event.allDay);
  const timed = events
    .filter((event) => !event.allDay)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {allDay.length > 0 && (
        <div className="border-border/60 mb-3 space-y-1.5 border-b pb-3">
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-[0.12em]">
            {m['globalWorkspace.calendar.allDay']()}
          </p>
          {allDay.map((event) => (
            <button
              key={event.id}
              type="button"
              className="bg-muted hover:bg-accent block min-h-9 w-full truncate rounded-md px-2.5 py-2 text-left text-xs transition-colors"
              onClick={() => event.htmlLink && window.open(event.htmlLink, '_blank', 'noopener')}
            >
              {event.title}
            </button>
          ))}
        </div>
      )}
      {timed.length > 0 ? (
        <ol className="space-y-2">
          {timed.map((event) => (
            <li key={event.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
              <time
                dateTime={event.start}
                className="text-muted-foreground pt-2 text-right text-[11px] font-medium tabular-nums"
              >
                {format(new Date(event.start), 'p')}
              </time>
              <button
                type="button"
                className={cn(
                  'min-h-12 w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                  eventTones[colorIndex(event.id, event.colorId)],
                )}
                onClick={() => event.htmlLink && window.open(event.htmlLink, '_blank', 'noopener')}
                aria-label={`${event.title}, ${format(new Date(event.start), 'p')}–${format(new Date(event.end), 'p')}`}
              >
                <span className="block truncate font-medium">{event.title}</span>
                <span className="block truncate opacity-70">
                  {format(new Date(event.start), 'p')}–{format(new Date(event.end), 'p')}
                </span>
                {event.location && (
                  <span className="mt-0.5 flex items-center gap-1 truncate opacity-70">
                    <MapPin className="size-3 shrink-0" /> {event.location}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      ) : allDay.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center px-6 text-center">
          <p className="text-muted-foreground text-sm">{m['globalWorkspace.calendar.empty']()}</p>
        </div>
      ) : null}
    </div>
  );
}

function CreateEventDialog({
  open,
  onOpenChange,
  selectedDate,
  timeZone,
  authorizationRequired,
  onAuthorize,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
  timeZone: string;
  authorizationRequired: boolean;
  onAuthorize: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const form = useForm<EventForm>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      startTime: '09:00',
      endTime: '10:00',
      attendees: '',
      location: '',
      description: '',
      allDay: false,
      createMeetLink: false,
    },
  });
  const mutation = useMutation(
    trpc.calendar.createEvent.mutationOptions({
      onSuccess: (result) => {
        if (result.authorizationRequired) {
          void onAuthorize();
          return;
        }
        void queryClient.invalidateQueries({ queryKey: trpc.calendar.listDay.queryKey() });
        toast.success(m['globalWorkspace.calendar.created']());
        onOpenChange(false);
      },
      onError: () => toast.error(m['globalWorkspace.calendar.createFailed']()),
    }),
  );

  useEffect(() => {
    if (!open) return;
    const defaults = defaultEventWindow(selectedDate);
    form.reset({
      title: '',
      startTime: format(defaults.start, 'HH:mm'),
      endTime: format(defaults.end, 'HH:mm'),
      attendees: '',
      location: '',
      description: '',
      allDay: false,
      createMeetLink: false,
    });
  }, [form, open, selectedDate]);

  const submit = form.handleSubmit((values) => {
    const start = new Date(selectedDate);
    const end = new Date(selectedDate);
    if (values.allDay) {
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1);
      end.setHours(0, 0, 0, 0);
    } else {
      const [startHour, startMinute] = values.startTime.split(':').map(Number);
      const [endHour, endMinute] = values.endTime.split(':').map(Number);
      start.setHours(startHour!, startMinute!, 0, 0);
      end.setHours(endHour!, endMinute!, 0, 0);
      if (end <= start) {
        form.setError('endTime', { message: m['globalWorkspace.calendar.endAfterStart']() });
        return;
      }
    }
    mutation.mutate({
      title: values.title,
      description: values.description || undefined,
      location: values.location || undefined,
      attendees: values.attendees
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
      timeZone,
      allDay: values.allDay,
      start: start.toISOString(),
      end: end.toISOString(),
      createMeetLink: values.createMeetLink,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{m['globalWorkspace.calendar.createTitle']()}</DialogTitle>
          <DialogDescription>
            {format(selectedDate, 'EEEE, d MMMM yyyy')} · {timeZone}
          </DialogDescription>
        </DialogHeader>
        {authorizationRequired ? (
          <PanelMessage
            icon={CalendarDays}
            title={m['globalWorkspace.calendar.connectTitle']()}
            description={m['globalWorkspace.calendar.connectDescription']()}
            action={m['globalWorkspace.calendar.connect']()}
            onAction={() => void onAuthorize()}
          />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field
              label={m['globalWorkspace.calendar.title']()}
              error={form.formState.errors.title?.message}
            >
              <Input autoFocus {...form.register('title')} />
            </Field>
            <div className="flex items-center gap-2">
              <Checkbox
                id="calendar-all-day"
                checked={form.watch('allDay')}
                onCheckedChange={(value) => form.setValue('allDay', value === true)}
              />
              <label htmlFor="calendar-all-day" className="text-sm">
                {m['globalWorkspace.calendar.allDay']()}
              </label>
            </div>
            {!form.watch('allDay') && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={m['globalWorkspace.calendar.starts']()}>
                  <Input type="time" {...form.register('startTime')} />
                </Field>
                <Field
                  label={m['globalWorkspace.calendar.ends']()}
                  error={form.formState.errors.endTime?.message}
                >
                  <Input type="time" {...form.register('endTime')} />
                </Field>
              </div>
            )}
            <Field label={m['globalWorkspace.calendar.guests']()}>
              <div className="relative">
                <Users className="text-muted-foreground absolute left-3 top-2.5 size-4" />
                <Input
                  className="pl-9"
                  placeholder="name@example.com"
                  {...form.register('attendees')}
                />
              </div>
            </Field>
            <Field label={m['globalWorkspace.calendar.location']()}>
              <div className="relative">
                <MapPin className="text-muted-foreground absolute left-3 top-2.5 size-4" />
                <Input className="pl-9" {...form.register('location')} />
              </div>
            </Field>
            <Field label={m['globalWorkspace.calendar.description']()}>
              <textarea
                className="border-input bg-background focus-visible:ring-ring min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                {...form.register('description')}
              />
            </Field>
            <div className="flex items-center gap-2">
              <Checkbox
                id="calendar-meet"
                checked={form.watch('createMeetLink')}
                onCheckedChange={(value) => form.setValue('createMeetLink', value === true)}
              />
              <label htmlFor="calendar-meet" className="flex items-center gap-2 text-sm">
                <Video className="size-4" /> {m['globalWorkspace.calendar.addMeet']()}
              </label>
            </div>
            <p className="text-muted-foreground text-xs">
              {m['globalWorkspace.calendar.inviteNotice']()}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {m['globalWorkspace.cancel']()}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {m['globalWorkspace.calendar.create']()}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="text-destructive block text-xs">{error}</span>}
    </label>
  );
}

function PanelMessage({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="bg-muted mb-4 flex size-11 items-center justify-center rounded-full">
        <Icon className="text-muted-foreground size-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-muted-foreground mt-1 max-w-xs text-xs">{description}</p>}
      {action && onAction && (
        <Button className="mt-4" size="sm" onClick={onAction}>
          <Link2 className="size-4" /> {action}
        </Button>
      )}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-4 motion-safe:animate-pulse">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="bg-muted h-2 w-8 rounded" />
          <div className="bg-muted h-px flex-1" />
        </div>
      ))}
    </div>
  );
}

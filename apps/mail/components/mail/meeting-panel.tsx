import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CalendarCheck2, CalendarPlus, LoaderCircle, ShieldCheck, Video } from 'lucide-react';
import { buildCalendarDraftUrl, type CalendarDraftProvider } from '@/lib/meeting-deeplink';
import { requestCalendarFreebusyAuthorization } from '@/lib/calendar-authorization';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { useTRPC } from '@/providers/query-provider';
import { useEffect, useMemo, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { m } from '@/paraglide/messages';
import { toast } from 'sonner';

const pad = (value: number) => value.toString().padStart(2, '0');

const defaultStart = () => {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setMinutes(date.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (date.getMinutes() === 0) date.setHours(date.getHours() + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export function MeetingPanel({ threadId }: { threadId: string }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const previewQuery = useQuery(
    trpc.meet.prepareFromThread.queryOptions({ threadId }, { enabled: open }),
  );
  const preview = previewQuery.data?.preview;
  const [subject, setSubject] = useState('');
  const [context, setContext] = useState('');
  const [timeZone, setTimeZone] = useState('UTC');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [startsAtLocal, setStartsAtLocal] = useState(defaultStart);
  const [guests, setGuests] = useState<string[]>([]);
  const [provider, setProvider] = useState<CalendarDraftProvider>('google');
  const [videoRequested, setVideoRequested] = useState(false);
  const [authorizationPending, setAuthorizationPending] = useState(false);

  useEffect(() => {
    if (!preview) return;
    setSubject(preview.subject);
    setContext(preview.context);
    setTimeZone(preview.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    setDurationMinutes(preview.suggestedDurationMinutes);
    setGuests(
      preview.participants.filter((participant) => !participant.isSelf).map((p) => p.email),
    );
  }, [preview]);

  const startsAt = useMemo(() => {
    try {
      return fromZonedTime(startsAtLocal, timeZone);
    } catch {
      return new Date(Number.NaN);
    }
  }, [startsAtLocal, timeZone]);

  const absolutePreview = useMemo(() => {
    if (Number.isNaN(startsAt.getTime())) return null;
    try {
      return formatInTimeZone(startsAt, timeZone, 'EEE d MMM yyyy, HH:mm (zzz)');
    } catch {
      return null;
    }
  }, [startsAt, timeZone]);

  const availabilityInput = useMemo(() => {
    if (Number.isNaN(startsAt.getTime())) {
      return {
        timeMin: '1970-01-01T00:00:00.000Z',
        timeMax: '1970-01-01T00:30:00.000Z',
        timeZone: 'UTC',
      };
    }
    return {
      timeMin: startsAt.toISOString(),
      timeMax: new Date(startsAt.getTime() + durationMinutes * 60_000).toISOString(),
      timeZone,
    };
  }, [durationMinutes, startsAt, timeZone]);
  const availabilityQuery = useQuery(
    trpc.meet.getAvailability.queryOptions(availabilityInput, {
      enabled: false,
      retry: false,
    }),
  );

  const authorizeAvailability = async () => {
    if (authorizationPending) return;
    setAuthorizationPending(true);
    try {
      const result = await requestCalendarFreebusyAuthorization(window.location.href);
      if (!result.url) throw new Error('Missing calendar authorization URL');
      window.location.assign(result.url);
    } catch {
      setAuthorizationPending(false);
      toast.error(m['meetingPanel.permissionError']());
    }
  };

  const launch = () => {
    try {
      const url = buildCalendarDraftUrl({
        provider,
        subject,
        context,
        startsAt,
        durationMinutes,
        timeZone,
        guests,
        videoRequested,
      });
      window.open(url, '_blank', 'noopener,noreferrer');
      setConfirmOpen(false);
      toast.info(m['meetingPanel.opened']());
    } catch {
      toast.error(m['meetingPanel.invalid']());
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={m['meetingPanel.open']()}
            className="focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white transition-colors duration-200 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 dark:bg-[#313131] dark:hover:bg-[#404040]"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{m['meetingPanel.title']()}</DialogTitle>
            <DialogDescription>{m['meetingPanel.description']()}</DialogDescription>
          </DialogHeader>

          {previewQuery.isLoading ? (
            <div className="flex min-h-40 items-center justify-center" aria-busy="true">
              <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            </div>
          ) : previewQuery.isError || !preview ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-muted-foreground text-sm">{m['meetingPanel.error']()}</p>
              <Button variant="outline" onClick={() => void previewQuery.refetch()}>
                {m['states.thread.retry']()}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm font-medium">
                {m['meetingPanel.subject']()}
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium">
                  {m['meetingPanel.start']()}
                  <Input
                    type="datetime-local"
                    value={startsAtLocal}
                    onChange={(event) => setStartsAtLocal(event.target.value)}
                  />
                </label>
                <label className="block space-y-1.5 text-sm font-medium">
                  {m['meetingPanel.duration']()}
                  <select
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(Number(event.target.value))}
                    className="bg-background h-9 w-full rounded-md border px-3 text-sm"
                  >
                    {[15, 30, 45, 60, 90].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} min
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block space-y-1.5 text-sm font-medium">
                {m['meetingPanel.timeZone']()}
                <Input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} />
              </label>
              {absolutePreview && (
                <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
                  {absolutePreview}
                </p>
              )}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{m['meetingPanel.guests']()}</legend>
                {preview.participants
                  .filter((participant) => !participant.isSelf)
                  .map((participant) => (
                    <label key={participant.email} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={guests.includes(participant.email)}
                        onCheckedChange={(checked) =>
                          setGuests((current) =>
                            checked
                              ? [...new Set([...current, participant.email])]
                              : current.filter((email) => email !== participant.email),
                          )
                        }
                      />
                      <span className="truncate">
                        {participant.name ? `${participant.name} — ` : ''}
                        {participant.email}
                      </span>
                    </label>
                  ))}
                {preview.excluded.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {m['meetingPanel.excluded']({ count: preview.excluded.length })}
                  </p>
                )}
              </fieldset>
              <label className="block space-y-1.5 text-sm font-medium">
                {m['meetingPanel.context']()}
                <Textarea
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  rows={4}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium">
                  {m['meetingPanel.calendar']()}
                  <select
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as CalendarDraftProvider)}
                    className="bg-background h-9 w-full rounded-md border px-3 text-sm"
                  >
                    <option value="google">Google Calendar</option>
                    <option value="outlook">Outlook Calendar</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={videoRequested}
                    onCheckedChange={(value) => setVideoRequested(!!value)}
                  />
                  <Video className="h-4 w-4" aria-hidden="true" />
                  {m['meetingPanel.video']()}
                </label>
              </div>
              <div className="bg-muted/40 space-y-2 rounded-lg border p-3" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <CalendarCheck2 className="text-muted-foreground h-4 w-4 shrink-0" />
                    <p className="text-sm font-medium">{m['meetingPanel.availabilityTitle']()}</p>
                  </div>
                  {provider === 'google' && !availabilityQuery.data?.authorizationRequired ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!absolutePreview || availabilityQuery.isFetching}
                      onClick={() => void availabilityQuery.refetch()}
                    >
                      {availabilityQuery.isFetching ? (
                        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                      ) : (
                        m['meetingPanel.checkAvailability']()
                      )}
                    </Button>
                  ) : null}
                </div>

                {provider !== 'google' ? (
                  <p className="text-muted-foreground text-xs">
                    {m['meetingPanel.availabilityGoogleOnly']()}
                  </p>
                ) : availabilityQuery.data?.authorizationRequired ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">
                      {m['meetingPanel.permissionRequired']()}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={authorizationPending}
                      onClick={() => void authorizeAvailability()}
                    >
                      {authorizationPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <>
                          <ShieldCheck className="mr-1.5 h-4 w-4" />
                          {m['meetingPanel.grantPermission']()}
                        </>
                      )}
                    </Button>
                  </div>
                ) : availabilityQuery.isError ? (
                  <p className="text-destructive text-xs">
                    {m['meetingPanel.availabilityError']()}
                  </p>
                ) : availabilityQuery.data ? (
                  availabilityQuery.data.busy.length === 0 ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      {m['meetingPanel.available']()}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {m['meetingPanel.busy']()}
                      </p>
                      {availabilityQuery.data.busy.map((interval) => (
                        <p
                          key={`${interval.start}-${interval.end}`}
                          className="text-muted-foreground text-xs"
                        >
                          {m['meetingPanel.busyDetail']({
                            start: formatInTimeZone(interval.start, timeZone, 'HH:mm'),
                            end: formatInTimeZone(interval.end, timeZone, 'HH:mm'),
                          })}
                        </p>
                      ))}
                    </div>
                  )
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {m['meetingPanel.availability']()}
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m['common.actions.cancel']()}
            </Button>
            <Button
              disabled={!preview || !subject.trim() || !absolutePreview}
              onClick={() => setConfirmOpen(true)}
            >
              {m['meetingPanel.continue']()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m['meetingPanel.confirmTitle']()}</DialogTitle>
            <DialogDescription>{m['meetingPanel.confirmDescription']()}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {m['common.actions.cancel']()}
            </Button>
            <Button onClick={launch}>{m['meetingPanel.openCalendar']()}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

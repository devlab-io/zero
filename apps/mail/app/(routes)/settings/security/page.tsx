import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsCard } from '@/components/settings/settings-card';
import { useTRPC } from '@/providers/query-provider';
import { zodResolver } from '@/lib/zod-resolver';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { m } from '@/paraglide/messages';
import { Loader2 } from 'lucide-react';

import { useState } from 'react';
import * as z from 'zod';

const formSchema = z.object({
  twoFactorAuth: z.boolean(),
  loginNotifications: z.boolean(),
});

export default function SecurityPage() {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      twoFactorAuth: false,
      loginNotifications: true,
    },
  });

  function onSubmit(_values: z.infer<typeof formSchema>) {
    setIsSaving(true);

    // TODO: Save settings in user's account
    setTimeout(() => {
      setIsSaving(false);
    }, 1000);
  }

  return (
    <div className="grid gap-6">
      <SettingsCard
        title={m['pages.settings.security.title']()}
        description={m['pages.settings.security.description']()}
        footer={
          <div className="flex gap-4">
            <Button variant="destructive">{m['pages.settings.security.deleteAccount']()}</Button>
            <Button type="submit" form="security-form" disabled={isSaving}>
              {isSaving ? m['common.actions.saving']() : m['common.actions.saveChanges']()}
            </Button>
          </div>
        }
      >
        <Form {...form}>
          <form id="security-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="flex w-full flex-col items-center gap-5 md:flex-row">
              <FormField
                control={form.control}
                name="twoFactorAuth"
                render={({ field }) => (
                  <FormItem className="bg-popover flex w-full flex-row items-center justify-between rounded-lg border p-4 md:w-auto">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {m['pages.settings.security.twoFactorAuth']()}
                      </FormLabel>
                      <FormDescription>
                        {m['pages.settings.security.twoFactorAuthDescription']()}
                      </FormDescription>
                    </div>
                    <FormControl className="ml-4">
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="loginNotifications"
                render={({ field }) => (
                  <FormItem className="bg-popover flex w-full flex-row items-center justify-between rounded-lg border p-4 md:w-auto">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {m['pages.settings.security.loginNotifications']()}
                      </FormLabel>
                      <FormDescription>
                        {m['pages.settings.security.loginNotificationsDescription']()}
                      </FormDescription>
                    </div>
                    <FormControl className="ml-4">
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </SettingsCard>

      <SessionsCard />
    </div>
  );
}

/**
 * P17-D — appareils et sessions révocables. La liste vient du serveur SANS
 * token (des ids seuls) ; la révocation passe par better-auth (Postgres +
 * cache), fenêtre résiduelle bornée à 5 minutes par le cookieCache.
 */
function SessionsCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    trpc.user.listSessions.queryOptions(undefined, { staleTime: 15_000 }),
  );
  const sessions = data?.sessions ?? [];
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: trpc.user.listSessions.queryKey() });
  const revoke = useMutation(trpc.user.revokeSession.mutationOptions({ onSuccess: invalidate }));
  const revokeOthers = useMutation(
    trpc.user.revokeOtherSessions.mutationOptions({ onSuccess: invalidate }),
  );

  return (
    <SettingsCard
      title={m['pages.settings.security.sessionsTitle']()}
      description={m['pages.settings.security.sessionsDescription']()}
      footer={
        sessions.length > 1 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate(undefined)}
          >
            {m['pages.settings.security.sessionRevokeOthers']()}
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="bg-popover flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate">
                  {session.userAgent ?? m['pages.settings.security.sessionUnknownDevice']()}
                  {session.current && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {m['pages.settings.security.currentSession']()}
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {m['pages.settings.security.sessionLastActive']({
                    date: new Date(session.updatedAt).toLocaleString(),
                  })}
                </span>
              </span>
              {!session.current && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ sessionId: session.id })}
                >
                  {m['pages.settings.security.sessionRevoke']()}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

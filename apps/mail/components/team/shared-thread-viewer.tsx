import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadAttachment } from '@/components/mail/mail-display.attachments';
import { useTRPC, useTRPCClient } from '@/providers/query-provider';
import { MailContent } from '@/components/mail/mail-content';
import { Loader2, Paperclip, Download } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { format } from 'date-fns';
import { useState } from 'react';

/**
 * Lecteur CROSS-ACCOUNT d'un fil partagé : un équipier autorisé — même sans
 * connexion sur la boîte du partageur — lit le fil complet (snapshot + futurs
 * messages) et télécharge les PJ via le proxy backend borné au teamThread
 * (readSharedThread / readSharedAttachment, ACL résolue à chaque appel).
 * Lecture seule : répondre se fait depuis sa propre boîte quand on la
 * possède, jamais depuis celle du partageur.
 */

export function SharedThreadViewer({
  teamThreadId,
  open,
  onOpenChange,
}: {
  teamThreadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const { data, isLoading, isError } = useQuery(
    trpc.teams.readSharedThread.queryOptions(
      { teamThreadId: teamThreadId ?? '' },
      { enabled: open && !!teamThreadId, staleTime: 15_000 },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6 text-base">
            {data?.share.subject || m['common.teams.viewShared']()}
          </DialogTitle>
          {data && (
            <p className="text-muted-foreground text-xs">
              {m['common.teams.sharedReadOnly']({ email: data.share.sharerEmail })}
            </p>
          )}
        </DialogHeader>
        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : isError || !data ? (
          <p className="text-muted-foreground py-6 text-sm">{m['common.teams.loadError']()}</p>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 pr-3">
              {data.thread.messages.map((message) => (
                <SharedMessage key={message.id} teamThreadId={teamThreadId!} message={message} />
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

type SharedMessageData = {
  id: string;
  subject: string;
  sender: { name?: string; email: string };
  receivedOn: string;
  processedHtml: string;
  body: string;
  attachments?: {
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }[];
};

function SharedMessage({
  teamThreadId,
  message,
}: {
  teamThreadId: string;
  message: SharedMessageData;
}) {
  const client = useTRPCClient();
  const [downloading, setDownloading] = useState<string | null>(null);
  const attachments = (message.attachments ?? []).filter((a) => a.attachmentId);

  const handleDownload = async (attachment: (typeof attachments)[number]) => {
    if (downloading) return;
    setDownloading(attachment.attachmentId);
    try {
      // Proxy borné : la PJ transite par le backend APRÈS resolveAccess —
      // jamais un accès direct à la boîte du partageur.
      const full = await client.teams.readSharedAttachment.query({
        teamThreadId,
        messageId: message.id,
        attachmentId: attachment.attachmentId,
      });
      await downloadAttachment({
        body: full.body,
        mimeType: full.mimeType,
        filename: full.filename,
        attachmentId: attachment.attachmentId,
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <article className="rounded-lg border border-[#E7E7E7] bg-white p-3 dark:border-[#252525] dark:bg-[#1E1E1E]">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">
          {message.sender.name || message.sender.email}
        </span>
        <time className="text-muted-foreground shrink-0 text-xs" dateTime={message.receivedOn}>
          {format(new Date(message.receivedOn), 'd MMM yyyy HH:mm')}
        </time>
      </header>
      <MailContent
        id={message.id}
        html={message.processedHtml || message.body}
        senderEmail={message.sender.email}
        senderName={message.sender.name}
      />
      {attachments.length > 0 && (
        <footer className="mt-2 border-t border-[#E7E7E7] pt-2 dark:border-[#252525]">
          <p className="text-muted-foreground mb-1 flex items-center gap-1 text-xs">
            <Paperclip className="h-3 w-3" /> {m['common.teams.attachments']()}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <li key={attachment.attachmentId}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={downloading !== null}
                  onClick={() => void handleDownload(attachment)}
                >
                  {downloading === attachment.attachmentId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  <span className="max-w-40 truncate">{attachment.filename}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {Math.max(1, Math.round(attachment.size / 1024))} kB
                  </Badge>
                </Button>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  );
}

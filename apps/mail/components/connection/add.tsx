import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { useBilling } from '@/hooks/use-billing';
import { emailProviders } from '@/lib/constants';
import { authClient } from '@/lib/auth-client';
import { Plus, UserPlus } from 'lucide-react';
import { useLocation } from 'react-router';
import { m } from '@/paraglide/messages';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import { toast } from 'sonner';

export const AddConnectionDialog = ({
  children,
  className,
  onOpenChange,
}: {
  children?: React.ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) => {
  const { connections, attach } = useBilling();

  const canCreateConnection = useMemo(() => {
    if (!connections?.remaining && !connections?.unlimited) return false;
    return (connections?.unlimited && !connections?.remaining) || (connections?.remaining ?? 0) > 0;
  }, [connections]);
  const pathname = useLocation().pathname;

  const handleUpgrade = async () => {
    if (attach) {
      toast.promise(
        attach({
          productId: 'pro-example',
          successUrl: `${window.location.origin}/mail/inbox?success=true`,
        }),
        {
          success: 'Redirecting to payment...',
          error: 'Failed to process upgrade. Please try again later.',
        },
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button
            size={'dropdownItem'}
            variant={'dropdownItem'}
            className={cn('w-full justify-start gap-2', className)}
          >
            <UserPlus size={16} strokeWidth={2} className="opacity-60" aria-hidden="true" />
            <p className="text-[13px] opacity-60">{m['pages.settings.connections.addEmail']()}</p>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent showOverlay={true}>
        <DialogHeader>
          <DialogTitle>{m['pages.settings.connections.connectEmail']()}</DialogTitle>
          <DialogDescription>
            {m['pages.settings.connections.connectEmailDescription']()}
          </DialogDescription>
        </DialogHeader>
        {!canCreateConnection && (
          <div className="mt-2 flex justify-between gap-2 rounded-lg border border-red-800 bg-red-800/20 p-2">
            <span className="text-sm">
              You can only connect 1 email in the free tier.{' '}
              <span
                onClick={handleUpgrade}
                className="hover:bg-subtleWhite hover:text-subtleBlack cursor-pointer underline"
              >
                Start 7 day free trial
              </span>{' '}
              to connect more.
            </span>
            <Button onClick={handleUpgrade} className="text-sm">
              $20<span className="text-muted-foreground -ml-2 text-xs">/month</span>
            </Button>
          </div>
        )}
        {/* #44 (gate A8): motion/react removed here so this dialog no longer pulls the `motion`
            chunk into the critical inbox path. The entrance (grid opacity fade + per-tile
            opacity/translate stagger) uses self-contained CSS keyframes; the slide uses the CSS
            `translate` property so it does not clobber the hover/active `transform: scale`. Honours
            prefers-reduced-motion. Rendered only when the connection dialog is open. */}
        <style>
          {
            '@keyframes zero-conn-grid{from{opacity:0}to{opacity:1}}' +
              '@keyframes zero-conn-tile{from{opacity:0;translate:0 20px}to{opacity:1;translate:0 0}}' +
              '.zero-conn-grid{animation:zero-conn-grid .3s ease both}' +
              '.zero-conn-tile{animation:zero-conn-tile .3s ease both;animation-delay:var(--zero-conn-delay,0s)}' +
              '@media (prefers-reduced-motion:reduce){.zero-conn-grid,.zero-conn-tile{animation:none}}'
          }
        </style>
        <div className="zero-conn-grid mt-4 grid grid-cols-2 gap-4">
          {emailProviders.map((provider, index) => {
            const Icon = provider.icon;
            return (
              <div
                key={provider.name}
                className="zero-conn-tile transition-transform hover:scale-[1.03] active:scale-[0.97]"
                style={{ '--zero-conn-delay': `${index * 0.1}s` } as React.CSSProperties}
              >
                <Button
                  disabled={!canCreateConnection}
                  variant="outline"
                  className="h-24 w-full flex-col items-center justify-center gap-2"
                  onClick={async () =>
                    await authClient.linkSocial({
                      provider: provider.providerId,
                      callbackURL: `${window.location.origin}${pathname}`,
                    })
                  }
                >
                  <Icon className="size-6!" />
                  <span className="text-xs">{provider.name}</span>
                </Button>
              </div>
            );
          })}
          <div
            className="zero-conn-tile transition-transform hover:scale-[1.03] active:scale-[0.97]"
            style={{ '--zero-conn-delay': `${emailProviders.length * 0.1}s` } as React.CSSProperties}
          >
            <Button
              variant="outline"
              className="h-24 w-full flex-col items-center justify-center gap-2 border-dashed"
            >
              <Plus className="h-12 w-12" />
              <span className="text-xs">{m['pages.settings.connections.moreComingSoon']()}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

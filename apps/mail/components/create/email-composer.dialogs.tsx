import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '../ui/button';

// Composer confirmation dialogs, extracted verbatim from email-composer.tsx
// (behaviour unchanged); closures are passed as props.

interface ComposerDialogsProps {
  showLeaveConfirmation: boolean;
  onLeaveOpenChange: (open: boolean) => void;
  onStay: () => void;
  onLeave: () => void;
  showAttachmentWarning: boolean;
  onAttachmentWarningOpenChange: (open: boolean) => void;
  onSendAnyway: () => void;
}

export function ComposerDialogs({
  showLeaveConfirmation,
  onLeaveOpenChange,
  onStay,
  onLeave,
  showAttachmentWarning,
  onAttachmentWarningOpenChange,
  onSendAnyway,
}: ComposerDialogsProps) {
  return (
    <>
      <Dialog open={showLeaveConfirmation} onOpenChange={onLeaveOpenChange}>
        <DialogContent showOverlay className="z-99999 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Discard message?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in your email. Are you sure you want to leave? Your changes
              will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={onStay} className="cursor-pointer">
              Stay
            </Button>
            <Button variant="destructive" onClick={onLeave} className="cursor-pointer">
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAttachmentWarning} onOpenChange={onAttachmentWarningOpenChange}>
        <DialogContent showOverlay className="z-99999 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Attachment Warning</DialogTitle>
            <DialogDescription>
              Looks like you mentioned an attachment in your message, but there are no files
              attached. Are you sure you want to send this email?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => onAttachmentWarningOpenChange(false)}
              className="cursor-pointer"
            >
              Recheck
            </Button>
            <Button
              onClick={onSendAnyway}
              className="cursor-pointer"
            >
              Send Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

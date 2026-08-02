import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DraftListRow } from './draft-workspace-model';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { m } from '@/paraglide/messages';
import { Trash2 } from 'lucide-react';

export function DraftBulkActionBar({
  count,
  onClear,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onDelete: () => void;
}) {
  if (!count) return null;
  return (
    <div className="border-border/60 bg-muted/35 flex items-center justify-between gap-3 border-b px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {count}
        </Badge>
        <span className="text-muted-foreground truncate text-xs">
          {m['draftWorkspace.selected']({ count })}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          {m['draftWorkspace.clearSelection']()}
        </Button>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onDelete}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 shrink-0"
      >
        <Trash2 className="size-4" />
        {m['draftWorkspace.deleteSelected']()}
      </Button>
    </div>
  );
}

export function DraftDeleteDialog({
  candidates,
  onOpenChange,
  onConfirm,
}: {
  candidates: DraftListRow[];
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const count = candidates.length;
  return (
    <Dialog open={count > 0} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {count > 1
              ? m['draftWorkspace.deleteManyTitle']({ count })
              : m['draftWorkspace.deleteTitle']()}
          </DialogTitle>
          <DialogDescription>
            {count > 1
              ? m['draftWorkspace.deleteManyDescription']({ count })
              : m['draftWorkspace.deleteDescription']({
                  subject: candidates[0]?.subject ?? m['draftWorkspace.untitled'](),
                })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {m['draftWorkspace.cancel']()}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {m['draftWorkspace.delete']()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

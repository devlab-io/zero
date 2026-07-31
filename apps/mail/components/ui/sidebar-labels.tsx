import {
  DEFAULT_VISIBLE_SIDEBAR_LABELS,
  isSidebarLabelToggleKey,
  rankSidebarLabels,
  visibleSidebarLabels,
} from '@/lib/sidebar-labels-order';
import { useActiveConnection } from '@/hooks/use-connections';
import { useCallback, useMemo, useState } from 'react';
import { RecursiveFolder } from './recursive-folder';
import type { Label as LabelType } from '@/types';
import { useStats } from '@/hooks/use-stats';
import { Tree } from '../magicui/file-tree';

type Props = {
  data: LabelType[];
};

type SidebarLabel = LabelType & { originalLabel?: LabelType };
type SidebarLabelEntry = {
  id: string;
  name: string;
  count: number;
  label: SidebarLabel;
};

const byName = (left: LabelType, right: LabelType) =>
  left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });

const SidebarLabels = ({ data }: Props) => {
  const { data: stats } = useStats();
  const { data: activeAccount } = useActiveConnection();
  const [showAll, setShowAll] = useState(false);

  const getLabelCount = useCallback(
    (labelName: string | undefined): number => {
      if (!stats || !labelName) return 0;
      return (
        stats.find((stat) => stat.label?.toLowerCase() === labelName.toLowerCase())?.count ?? 0
      );
    },
    [stats],
  );

  const entries = useMemo((): SidebarLabelEntry[] => {
    if (activeAccount?.providerId === 'microsoft') {
      return rankSidebarLabels(
        data.map((label) => ({
          id: label.id,
          name: label.name,
          count: getLabelCount(label.name),
          label,
        })),
      );
    }

    const brackets: LabelType[] = [];
    const other: LabelType[] = [];
    const folders: Record<string, LabelType[]> = {};
    const folderNames = new Set<string>();

    data.forEach((label) => {
      if (/[^/]+\/[^/]+/.test(label.name)) {
        const [folderName] = label.name.split('/') as [string];
        folderNames.add(folderName);
      }
    });

    data.forEach((label) => {
      if (folderNames.has(label.name)) return;
      if (/\[.*\]/.test(label.name)) {
        brackets.push(label);
        return;
      }
      if (/[^/]+\/[^/]+/.test(label.name)) {
        const [groupName] = label.name.split('/') as [string];
        (folders[groupName] ??= []).push(label);
        return;
      }
      other.push(label);
    });

    const results: SidebarLabelEntry[] = [];

    Object.entries(folders).forEach(([groupName, labels]) => {
      const folderLabel = data.find((label) => label.name === groupName);
      const sortedChildren = [...labels].sort(byName);
      const count = sortedChildren.reduce((total, label) => total + getLabelCount(label.name), 0);
      const groupFolder: SidebarLabel = {
        id: folderLabel?.id || `group-${groupName}`,
        name: groupName,
        type: folderLabel?.type || 'folder',
        color: folderLabel?.color,
        labels: sortedChildren.map((label) => ({
          id: label.id,
          name: label.name.split('/').slice(1).join('/'),
          type: label.type,
          color: label.color,
          originalLabel: label,
        })),
      };
      results.push({ id: groupFolder.id, name: groupName, count, label: groupFolder });
    });

    other.forEach((label) => {
      results.push({
        id: label.id,
        name: label.name,
        count: getLabelCount(label.name),
        label: { ...label, originalLabel: label },
      });
    });

    if (brackets.length > 0) {
      const sortedBrackets = [...brackets].sort(byName);
      const count = sortedBrackets.reduce((total, label) => total + getLabelCount(label.name), 0);
      const bracketFolder: SidebarLabel = {
        id: 'group-other',
        name: 'Other',
        type: 'folder',
        labels: sortedBrackets.map((label) => ({
          id: label.id,
          name: label.name.replace(/\[|\]/g, ''),
          type: label.type,
          color: label.color,
          originalLabel: label,
        })),
      };
      results.push({ id: bracketFolder.id, name: bracketFolder.name, count, label: bracketFolder });
    }

    return rankSidebarLabels(results);
  }, [activeAccount?.providerId, data, getLabelCount]);

  const visibleEntries = visibleSidebarLabels(entries, showAll);
  const hiddenCount = Math.max(0, entries.length - DEFAULT_VISIBLE_SIDEBAR_LABELS);

  return (
    <div className="mr-0 flex-1 pr-0">
      <div className="no-scrollbar relative -m-2 flex-1 overflow-auto bg-transparent">
        <Tree className="rounded-md bg-transparent">
          {visibleEntries.map((entry) => (
            <RecursiveFolder
              key={entry.id}
              label={entry.label}
              activeAccount={activeAccount}
              count={entry.count}
            />
          ))}
        </Tree>
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ml-2 mt-2 cursor-pointer text-xs transition-colors"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (!isSidebarLabelToggleKey(event.key)) return;
            event.preventDefault();
            setShowAll((current) => !current);
          }}
        >
          {showAll ? 'Show fewer' : `Show ${hiddenCount} more`}
        </button>
      ) : null}
    </div>
  );
};

export default SidebarLabels;

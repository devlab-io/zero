import { Bell, Lightning, Tag, User } from '../icons/icons';
import { Briefcase, Star, StickyNote, Users } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { m } from '@/paraglide/messages';
import { Badge } from '../ui/badge';

// Category label badges, extracted verbatim from mail-display.tsx.

export const MailDisplayLabels = ({ labels }: { labels: string[] }) => {
  const visibleLabels = labels.filter(
    (label) => !['unread', 'inbox'].includes(label.toLowerCase()),
  );

  if (!visibleLabels.length) return null;

  return (
    <div className="flex">
      {visibleLabels.map((label, index) => {
        const normalizedLabel = label.toLowerCase().replace(/^category_/i, '');

        let icon = null;
        let bgColor = '';
        let labelText = '';

        switch (normalizedLabel) {
          case 'important':
            icon = <Lightning className="h-3.5 w-3.5 fill-white" />;
            bgColor = 'bg-[#F59E0D]';
            labelText = m['common.mailCategories.important']();
            break;
          case 'promotions':
            icon = <Tag className="h-3.5 w-3.5 fill-white" />;
            bgColor = 'bg-[#F43F5E]';
            labelText = m['common.mailCategories.promotions']();
            break;
          case 'personal':
            icon = <User className="h-3.5 w-3.5 fill-white" />;
            bgColor = 'bg-[#39AE4A]';
            labelText = m['common.mailCategories.personal']();
            break;
          case 'updates':
            icon = <Bell className="h-3.5 w-3.5 fill-white" />;
            bgColor = 'bg-[#8B5CF6]';
            labelText = m['common.mailCategories.updates']();
            break;
          case 'work':
            icon = <Briefcase className="h-3.5 w-3.5 text-white" />;
            bgColor = '';
            labelText = m['common.mailCategories.work']();
            break;
          case 'forums':
            icon = <Users className="h-3.5 w-3.5 text-white" />;
            bgColor = 'bg-blue-600';
            labelText = m['common.mailCategories.forums']();
            break;
          case 'notes':
            icon = <StickyNote className="h-3.5 w-3.5 text-white" />;
            bgColor = 'bg-amber-500';
            labelText = m['common.mailCategories.notes']();
            break;
          case 'starred':
            icon = <Star className="h-3.5 w-3.5 fill-white text-white" />;
            bgColor = 'bg-yellow-500';
            labelText = m['common.mailCategories.starred']();
            break;
          default:
            return null;
        }

        return (
          <Tooltip key={`${label}-${index}`}>
            <TooltipTrigger>
              <Badge
                key={`${label}-${index}`}
                className={`rounded-md p-1 ${bgColor} dark:border-panelDark -ml-1.5 border-2 border-white transition-transform first:ml-0`}
              >
                {icon}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{labelText}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};

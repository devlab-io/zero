import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RecipientAutosuggest } from '@/components/ui/recipient-autosuggest';
import { m } from '@/paraglide/messages';
import { Loader } from 'lucide-react';
import { Sparkles, X } from '../icons/icons';
import type { ComposerFormValues } from './email-composer.types';
import type { Control } from 'react-hook-form';

// Composer header fields (To/Cc/Bcc, Subject, From), extracted verbatim from
// email-composer.tsx (behaviour unchanged); closures are passed as props.

type Alias = { email: string; name?: string; primary?: boolean };

interface ComposerHeaderProps {
  control: Control<ComposerFormValues>;
  isLoading: boolean;
  showCc: boolean;
  showBcc: boolean;
  onToggleCc: () => void;
  onToggleBcc: () => void;
  canClose: boolean;
  onCloseClick: () => void;
  activeReplyId: string | null;
  subjectInput: string;
  onSubjectInputChange: (value: string) => void;
  onGenerateSubject: () => void;
  isGeneratingSubject: boolean;
  messageLength: number;
  aliases: Alias[] | undefined;
  fromEmail: string;
  onFromChange: (value: string) => void;
}

export function ComposerHeader({
  control,
  isLoading,
  showCc,
  showBcc,
  onToggleCc,
  onToggleBcc,
  canClose,
  onCloseClick,
  activeReplyId,
  subjectInput,
  onSubjectInputChange,
  onGenerateSubject,
  isGeneratingSubject,
  messageLength,
  aliases,
  fromEmail,
  onFromChange,
}: ComposerHeaderProps) {
  return (
    <>
        {/* To, Cc, Bcc */}
        <div className="shrink-0 overflow-visible border-b border-[#E7E7E7] pb-2 dark:border-[#252525]">
          <div className="flex justify-between px-3 pt-3">
            <div className="flex w-full items-center gap-2">
              <p className="text-sm font-medium text-[#8C8C8C]">To:</p>
              <RecipientAutosuggest
                control={control}
                name="to"
                placeholder="Enter email address"
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-2">
              <button
                tabIndex={-1}
                className="flex h-full items-center gap-2 text-sm font-medium text-[#8C8C8C] hover:text-[#A8A8A8] hover:bg-gray-50 dark:hover:bg-[#404040] transition-colors cursor-pointer rounded-sm px-1 py-0.5"
                onClick={onToggleCc}
              >
                <span>Cc</span>
              </button>
              <button
                tabIndex={-1}
                className="flex h-full items-center gap-2 text-sm font-medium text-[#8C8C8C] hover:text-[#A8A8A8] hover:bg-gray-50 dark:hover:bg-[#404040] transition-colors cursor-pointer rounded-sm px-1 py-0.5"
                onClick={onToggleBcc}
              >
                <span>Bcc</span>
              </button>
              {canClose && (
                <button
                  tabIndex={-1}
                  className="flex h-full items-center gap-2 text-sm font-medium text-[#8C8C8C] hover:text-[#A8A8A8] hover:bg-gray-50 dark:hover:bg-[#404040] transition-colors cursor-pointer rounded-sm px-1 py-0.5"
                  onClick={onCloseClick}
                >
                  <X className="h-3.5 w-3.5 fill-[#9A9A9A]" />
                </button>
              )}
            </div>
          </div>

          <div className={`flex flex-col gap-2 ${showCc || showBcc ? 'pt-2' : ''}`}>
            {/* CC Section */}
            {showCc && (
              <div className="flex items-center gap-2 px-3">
                <p className="text-sm font-medium text-[#8C8C8C]">Cc:</p>
                <RecipientAutosuggest
                  control={control}
                  name="cc"
                  placeholder="Enter email for Cc"
                  disabled={isLoading}
                />
              </div>
            )}

            {/* BCC Section */}
            {showBcc && (
              <div className="flex items-center gap-2 px-3">
                <p className="text-sm font-medium text-[#8C8C8C]">Bcc:</p>
                <RecipientAutosuggest
                  control={control}
                  name="bcc"
                  placeholder="Enter email for Bcc"
                  disabled={isLoading}
                />
              </div>
            )}
          </div>
        </div>

        {/* Subject */}
        {!activeReplyId ? (
          <div className="flex items-center gap-2 border-b p-3">
            <p className="text-sm font-medium text-[#8C8C8C]">Subject:</p>
            {/* CUA 2026-07-30: the previous hardcoded placeholder ("Re: Design review
                feedback", marketing copy shared with the landing feature cards) was read
                back as the field VALUE by accessibility tooling on an empty subject —
                reported as a state leak. Neutral localized placeholder + explicit label. */}
            <input
              className="h-4 w-full bg-transparent text-sm font-normal leading-normal text-black placeholder:text-[#797979] focus:outline-none dark:text-white/90"
              placeholder={m['common.searchBar.subject']()}
              aria-label={m['common.searchBar.subject']()}
              value={subjectInput}
              onChange={(e) => onSubjectInputChange(e.target.value)}
            />
            <button
              onClick={onGenerateSubject}
              disabled={isLoading || isGeneratingSubject || messageLength < 1}
              className="hover:bg-gray-50 dark:hover:bg-[#404040] transition-colors cursor-pointer rounded p-1"
            >
              <div className="flex items-center justify-center gap-2.5 pl-0.5">
                <div className="flex h-5 items-center justify-center gap-1 rounded-sm">
                  {isGeneratingSubject ? (
                    <Loader className="h-3.5 w-3.5 animate-spin fill-black dark:fill-white" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 fill-black dark:fill-white" />
                  )}
                </div>
              </div>
            </button>
          </div>
        ) : null}

        {/* From */}
        {aliases && aliases.length > 1 ? (
          <div className="flex items-center gap-2 border-b p-3">
            <p className="text-sm font-medium text-[#8C8C8C]">From:</p>
            <Select
              value={fromEmail || ''}
              onValueChange={onFromChange}
            >
              <SelectTrigger className="h-6 flex-1 border-0 bg-transparent p-0 text-sm font-normal text-black placeholder:text-[#797979] focus:outline-none focus:ring-0 dark:text-white/90">
                <SelectValue placeholder="Select an email address" />
              </SelectTrigger>
              <SelectContent className="z-99999">
                {aliases.map((alias) => (
                  <SelectItem key={alias.email} value={alias.email}>
                    <div className="flex flex-row items-center gap-1">
                      <span className="text-sm">
                        {alias.name ? `${alias.name} <${alias.email}>` : alias.email}
                      </span>
                      {alias.primary && <span className="text-xs text-[#8C8C8C]">Primary</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
    </>
  );
}

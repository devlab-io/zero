import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RecipientAutosuggest } from '@/components/ui/recipient-autosuggest';
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
  subjectInput: string;
  onSubjectInputChange: (value: string) => void;
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
  subjectInput,
  onSubjectInputChange,
  aliases,
  fromEmail,
  onFromChange,
}: ComposerHeaderProps) {
  return (
    <>
      {/* To, Cc, Bcc — DOM order is the keyboard order. */}
      <div className="border-border shrink-0 overflow-visible border-b pb-2">
        <div className="flex min-w-0 flex-col gap-2 px-3 pt-3 sm:flex-row sm:items-start">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-muted-foreground shrink-0 text-sm font-medium">To:</span>
            <RecipientAutosuggest
              control={control}
              name="to"
              placeholder="Enter email address"
              disabled={isLoading}
            />
          </label>

          <div className="flex shrink-0 gap-1 self-end sm:self-start">
            <button
              type="button"
              aria-expanded={showCc}
              className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md px-2 text-sm font-medium transition-colors sm:min-h-10 sm:min-w-10"
              onClick={onToggleCc}
            >
              <span>Cc</span>
            </button>
            <button
              type="button"
              aria-expanded={showBcc}
              className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md px-2 text-sm font-medium transition-colors sm:min-h-10 sm:min-w-10"
              onClick={onToggleBcc}
            >
              <span>Bcc</span>
            </button>
          </div>
        </div>

        <div className={`flex flex-col gap-2 ${showCc || showBcc ? 'pt-2' : ''}`}>
          {/* CC Section */}
          {showCc && (
            <label className="flex min-w-0 items-center gap-2 px-3">
              <span className="text-muted-foreground shrink-0 text-sm font-medium">Cc:</span>
              <RecipientAutosuggest
                control={control}
                name="cc"
                placeholder="Enter email for Cc"
                disabled={isLoading}
              />
            </label>
          )}

          {/* BCC Section */}
          {showBcc && (
            <label className="flex min-w-0 items-center gap-2 px-3">
              <span className="text-muted-foreground shrink-0 text-sm font-medium">Bcc:</span>
              <RecipientAutosuggest
                control={control}
                name="bcc"
                placeholder="Enter email for Bcc"
                disabled={isLoading}
              />
            </label>
          )}
        </div>
      </div>

      {/* From */}
      {aliases && aliases.length > 1 ? (
        <div className="flex min-w-0 items-center gap-2 border-b p-3">
          <span className="text-muted-foreground shrink-0 text-sm font-medium">From:</span>
          <Select value={fromEmail || ''} onValueChange={onFromChange}>
            <SelectTrigger className="text-foreground placeholder:text-muted-foreground h-10 flex-1 border-0 bg-transparent p-0 text-sm font-normal focus:outline-none focus:ring-0">
              <SelectValue placeholder="Select an email address" />
            </SelectTrigger>
            <SelectContent className="z-99999">
              {aliases.map((alias) => (
                <SelectItem key={alias.email} value={alias.email}>
                  <div className="flex flex-row items-center gap-1">
                    <span className="text-sm">
                      {alias.name ? `${alias.name} <${alias.email}>` : alias.email}
                    </span>
                    {alias.primary && (
                      <span className="text-muted-foreground text-xs">Primary</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Subject remains the last header control before the message body. */}
      <label className="flex min-w-0 items-center gap-2 border-b p-3">
        <span className="text-muted-foreground shrink-0 text-sm font-medium">Subject:</span>
        <input
          className="text-foreground placeholder:text-muted-foreground h-10 min-w-0 flex-1 bg-transparent text-sm font-normal leading-normal focus:outline-none"
          placeholder="Re: Design review feedback"
          value={subjectInput}
          onChange={(e) => onSubjectInputChange(e.target.value)}
        />
      </label>
    </>
  );
}

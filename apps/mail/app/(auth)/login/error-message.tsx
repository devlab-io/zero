import { TriangleAlert } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { m } from '@/paraglide/messages';

const errorMessages = ['required_scopes_missing'] as const;

const errorToasts = ['early_access_required', 'unauthorized'] as const;

type ErrorToast = (typeof errorToasts)[number];
type ErrorMessage = (typeof errorMessages)[number];

// Literal lookups keep the paraglide catalog tree-shakable (no dynamic `m[...]` access).
const errorMessageText: Record<ErrorToast | ErrorMessage, () => string> = {
  required_scopes_missing: m['errorMessages.required_scopes_missing'],
  early_access_required: m['errorMessages.early_access_required'],
  unauthorized: m['errorMessages.unauthorized'],
};

const isErrorToast = (error: string): error is (typeof errorToasts)[number] =>
  errorToasts.includes(error as ErrorToast);

const isErrorMessage = (error: string): error is (typeof errorMessages)[number] =>
  errorMessages.includes(error as ErrorMessage);

const ErrorMessage = () => {
  const [error] = useQueryState('error');

  useEffect(() => {
    if (error && isErrorToast(error)) {
      toast.error(errorMessageText[error]());
    }
  });

  if (!error || !isErrorMessage(error)) {
    return null;
  }

  return (
    <div className="border-red/10 bg-red/5 min-w-0 max-w-fit shrink overflow-hidden break-words rounded-lg border p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center">
        <TriangleAlert size={28} />
        <p className="ml-2 text-sm text-black/80 dark:text-white/80">
          {errorMessageText[error]()}
        </p>
      </div>
    </div>
  );
};

export default ErrorMessage;

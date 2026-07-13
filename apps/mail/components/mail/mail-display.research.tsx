import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { useCallback, useEffect, useState } from 'react';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { TextShimmer } from '../ui/text-shimmer';
import { cn } from '@/lib/utils';
import type { Sender } from '@/types';
import { Loader2 } from 'lucide-react';

// Sender/query research dialogs + streaming text, extracted verbatim from
// mail-display.tsx (behaviour unchanged).

const cleanNameDisplay = (name?: string) => {
  if (!name) return '';
  return name.trim();
};

const StreamingText = ({ text }: { text: string }) => {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    let currentIndex = 0;
    setIsComplete(false);
    setIsThinking(true);

    const thinkingTimeout = setTimeout(() => {
      setIsThinking(false);
      setDisplayText('');

      const interval = setInterval(() => {
        if (currentIndex < text.length) {
          const nextChar = text[currentIndex];
          setDisplayText((prev) => prev + nextChar);
          currentIndex++;
        } else {
          setIsComplete(true);
          clearInterval(interval);
        }
      }, 20);

      return () => clearInterval(interval);
    }, 1000);

    return () => {
      clearTimeout(thinkingTimeout);
    };
  }, [text]);

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'bg-linear-to-r bg-size-[200%_100%] from-neutral-500 via-neutral-300 to-neutral-500 bg-clip-text text-sm leading-relaxed text-transparent',
          isComplete ? 'animate-shine-slow' : '',
        )}
      >
        {isThinking ? (
          <TextShimmer duration={1}>Thinking...</TextShimmer>
        ) : (
          <span>{displayText}</span>
        )}
        {!isComplete && !isThinking && (
          <span className="animate-blink bg-primary ml-0.5 inline-block h-4 w-0.5"></span>
        )}
      </div>
    </div>
  );
};

export const MoreAboutPerson = ({
  person,
  open,
  onOpenChange,
}: {
  person: Sender;
  extra?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const trpc = useTRPC();
  const {
    mutate: doSearch,
    isPending,
    data,
    error,
  } = useMutation(trpc.ai.webSearch.mutationOptions());
  const handleSearch = useCallback(() => {
    doSearch({
      query: `In 50 words or less: What is the background of ${person.name} & ${person.email}, of ${person.email.split('@')[1]}.
      This could be a phishing email address, indicate if the domain is suspicious, example: x.io is not a valid domain for x.com | example: x.com is a valid domain for x.com | example: paypalcom.com is not a valid domain for paypal.com`,
    });
  }, [person.name]);

  useEffect(() => {
    if (open) {
      handleSearch();
    }
  }, [open]);

  const findSource = useCallback(
    (id: string) => {
      const sources = data?.sources;
      if (!sources) return;
      return sources.find((source) => source.id === id);
    },
    [data],
  );

  const replaceSourcesInText = useCallback(
    (text: string) => {
      const sources = data?.sources;
      if (!sources) return text;
      const sourcesRegex = /\[(\d+)\]/g;
      return text.replaceAll(sourcesRegex, (match, p1) => {
        console.log('p1', p1);
        const source = findSource(p1);
        return source ? `SOURCE HERE` : match;
      });
    },
    [data],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showOverlay>
        <DialogHeader>
          <DialogTitle>More about {cleanNameDisplay(person.name)}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 flex justify-center">
          {isPending ? (
            <Loader2 className="animate-spin" />
          ) : data ? (
            <StreamingText text={replaceSourcesInText(data.text)} />
          ) : error ? (
            <p>Error: {error.message}</p>
          ) : (
            <Loader2 className="animate-spin" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const MoreAboutQuery = ({
  query,
  open,
  onOpenChange,
}: {
  query: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const trpc = useTRPC();
  const {
    mutate: doSearch,
    isPending,
    data,
    error,
  } = useMutation(trpc.ai.webSearch.mutationOptions());

  const handleSearch = useCallback(() => {
    doSearch({
      query: query,
    });
  }, [query, doSearch]);

  useEffect(() => {
    if (open && query) {
      handleSearch();
    }
  }, [open, query, handleSearch]);

  const findSource = useCallback(
    (id: string) => {
      const sources = data?.sources;
      if (!sources) return;
      return sources.find((source) => source.id === id);
    },
    [data],
  );

  const replaceSourcesInText = useCallback(
    (text: string) => {
      const sources = data?.sources;
      if (!sources) return text;
      const sourcesRegex = /\[(\d+)\]/g;
      return text.replaceAll(sourcesRegex, (match, p1) => {
        const source = findSource(p1);
        return source ? `SOURCE HERE` : match;
      });
    },
    [data, findSource],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showOverlay>
        <DialogHeader>
          <DialogTitle>Search Results</DialogTitle>
        </DialogHeader>
        <div className="mt-4 flex justify-center">
          {isPending ? (
            <Loader2 className="animate-spin" />
          ) : data ? (
            <StreamingText text={replaceSourcesInText(data.text)} />
          ) : error ? (
            <p>Error: {error.message}</p>
          ) : (
            <Loader2 className="animate-spin" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { getEmailLogo } from '@/lib/utils';

export const getFirstLetterCharacter = (name?: string) => {
  if (!name) return '';
  const match = name.match(/[a-zA-Z]/);
  return match ? match[0].toUpperCase() : '';
};

// w2cd (client weight): DOMPurify is only needed when a BIMI SVG logo actually
// exists (rare). Dynamic import keeps it out of the critical inbox bundle.
const BimiSvgLogo = ({ svgContent, className }: { svgContent: string; className?: string }) => {
  const [sanitized, setSanitized] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('dompurify').then((mod) => {
      if (cancelled) return;
      setSanitized(mod.default.sanitize(svgContent));
    });
    return () => {
      cancelled = true;
    };
  }, [svgContent]);

  if (sanitized === null) {
    return <div className={className} aria-hidden />;
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitized }} />;
};

interface BimiAvatarProps {
  email?: string;
  name?: string;
  className?: string;
  fallbackClassName?: string;
  onImageError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export const BimiAvatar = ({
  email,
  name,
  className = 'h-8 w-8 rounded-full border dark:border-none',
  fallbackClassName = 'rounded-full bg-[#FFFFFF] font-bold text-[#9F9F9F] dark:bg-[#373737]',
  onImageError,
}: BimiAvatarProps) => {
  const trpc = useTRPC();
  const [useDefaultFallback, setUseDefaultFallback] = useState(false);

  const { data: bimiData, isLoading } = useQuery({
    ...trpc.bimi.getByEmail.queryOptions({ email: email || '' }),
    enabled: !!email && !useDefaultFallback,
    staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // Keep in cache for 7 days
  });

  const fallbackImageSrc = useMemo(() => {
    if (useDefaultFallback || !email) return '';
    return getEmailLogo(email);
  }, [email, useDefaultFallback]);

  const handleFallbackImageError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setUseDefaultFallback(true);
      if (onImageError) {
        onImageError(e);
      }
    },
    [onImageError],
  );

  const firstLetter = getFirstLetterCharacter(name || email);

  if (!email) {
    return (
      <Avatar className={className}>
        <AvatarFallback className={fallbackClassName}>{firstLetter}</AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className={className}>
      {bimiData?.logo?.svgContent && !isLoading ? (
        <BimiSvgLogo
          svgContent={bimiData.logo.svgContent}
          className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white dark:bg-[#373737]"
        />
      ) : fallbackImageSrc && !useDefaultFallback ? (
        <AvatarImage
          className="rounded-full bg-[#FFFFFF] dark:bg-[#373737]"
          src={fallbackImageSrc}
          alt={name || email}
          onError={handleFallbackImageError}
        />
      ) : getEmailLogo(email) ? (
        <AvatarImage
          className="rounded-full bg-[#FFFFFF] dark:bg-[#373737]"
          src={getEmailLogo(email)}
          alt={name || email}
          onError={handleFallbackImageError}
        />
      ) : (
        <AvatarFallback className={fallbackClassName}>{firstLetter}</AvatarFallback>
      )}
    </Avatar>
  );
};

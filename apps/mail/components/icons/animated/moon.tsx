import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/lib/utils';

export interface MoonIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

// #44 (gate A8): motion/react removed so this icon no longer pulls the `motion` chunk into the
// critical inbox path. Feedback is a brief active-state transition, not a decorative wobble.
const MoonIcon = forwardRef<MoonIconHandle, HTMLAttributes<HTMLDivElement>>(
  ({ onMouseEnter, onMouseLeave, ...props }, ref) => {
    const [isActive, setIsActive] = useState(false);
    const isControlledRef = useRef(false);
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopFeedback = useCallback(() => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
      setIsActive(false);
    }, []);

    const startFeedback = useCallback(() => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setIsActive(true);
      resetTimerRef.current = setTimeout(() => {
        resetTimerRef.current = null;
        setIsActive(false);
      }, 200);
    }, []);

    useEffect(() => stopFeedback, [stopFeedback]);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: startFeedback,
        stopAnimation: stopFeedback,
      };
    }, [startFeedback, stopFeedback]);

    const handleMouseEnter = useCallback(
      (e: ReactMouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) startFeedback();
        else onMouseEnter?.(e);
      },
      [onMouseEnter, startFeedback],
    );

    const handleMouseLeave = useCallback(
      (e: ReactMouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) stopFeedback();
        else onMouseLeave?.(e);
      },
      [onMouseLeave, stopFeedback],
    );

    return (
      <div
        className="hover:bg-accent flex cursor-pointer select-none items-center justify-center rounded-md p-2 transition-colors duration-200"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'origin-center transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
            isActive ? 'scale-95 opacity-80' : 'scale-100 opacity-100',
          )}
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </div>
    );
  },
);

MoonIcon.displayName = 'MoonIcon';

export { MoonIcon };

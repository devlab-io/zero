import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SquarePenIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

// #44 (gate A8): motion/react removed so this icon no longer pulls the `motion` chunk into the
// critical inbox path. Feedback is a brief active-state transition, not a decorative wobble.
const SquarePenIcon = forwardRef<SquarePenIconHandle, HTMLAttributes<HTMLDivElement>>(
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
        className="hover:bg-accent/10 flex cursor-pointer select-none items-center justify-center rounded-md transition-colors duration-200"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
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
          style={{ overflow: 'visible' }}
        >
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
        </svg>
      </div>
    );
  },
);

SquarePenIcon.displayName = 'SquarePenIcon';

export { SquarePenIcon };

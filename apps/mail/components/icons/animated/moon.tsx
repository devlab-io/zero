import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from 'react';

export interface MoonIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

// #44 (gate A8): motion/react removed so this icon no longer pulls the `motion` chunk into the
// critical inbox path. The rotate wobble is implemented with a self-contained CSS keyframe. `runId`
// increments on every start/hover-enter and keys the animated <svg>, so a keyed remount re-runs the
// CSS animation from the start on each call — even when it is already running. The MoonIconHandle
// (startAnimation/stopAnimation) and the mouse-enter/leave triggers are retained.
const MoonIcon = forwardRef<MoonIconHandle, HTMLAttributes<HTMLDivElement>>(
  ({ onMouseEnter, onMouseLeave, ...props }, ref) => {
    const [runId, setRunId] = useState(0);
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => setRunId((n) => n + 1),
        stopAnimation: () => setRunId(0),
      };
    });

    const handleMouseEnter = useCallback(
      (e: ReactMouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) setRunId((n) => n + 1);
        else onMouseEnter?.(e);
      },
      [onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e: ReactMouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) setRunId(0);
        else onMouseLeave?.(e);
      },
      [onMouseLeave],
    );

    return (
      <div
        className="hover:bg-accent flex cursor-pointer select-none items-center justify-center rounded-md p-2 transition-colors duration-200"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <style>
          {
            '@keyframes zero-moon-wobble{0%{transform:rotate(0deg)}20%{transform:rotate(-10deg)}40%{transform:rotate(10deg)}60%{transform:rotate(-5deg)}80%{transform:rotate(5deg)}100%{transform:rotate(0deg)}}'
          }
        </style>
        <svg
          key={runId}
          xmlns="http://www.w3.org/2000/svg"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={
            runId > 0
              ? { transformOrigin: 'center', animation: 'zero-moon-wobble 1.2s ease-in-out' }
              : undefined
          }
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </div>
    );
  },
);

MoonIcon.displayName = 'MoonIcon';

export { MoonIcon };

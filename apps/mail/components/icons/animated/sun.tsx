import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from 'react';

export interface SunIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

const RAYS = [
  'M12 2v2',
  'm19.07 4.93-1.41 1.41',
  'M20 12h2',
  'm17.66 17.66 1.41 1.41',
  'M12 20v2',
  'm6.34 17.66-1.41 1.41',
  'M2 12h2',
  'm4.93 4.93 1.41 1.41',
];

// #44 (gate A8): motion/react removed so this icon no longer pulls the `motion` chunk into the
// critical inbox path. The staggered ray fade-in is implemented with a self-contained CSS keyframe.
// `runId` increments on every start/hover-enter and keys the animated paths, so a keyed remount
// re-runs the CSS animation from the start on each call — even when it is already running. The
// SunIconHandle (startAnimation/stopAnimation) and the mouse-enter/leave triggers are retained.
const SunIcon = forwardRef<SunIconHandle, HTMLAttributes<HTMLDivElement>>(
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
        <style>{'@keyframes zero-sun-ray-fade{from{opacity:0}to{opacity:1}}'}</style>
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
        >
          <circle cx="12" cy="12" r="4" />
          {RAYS.map((d, index) => (
            <path
              key={`${d}-${runId}`}
              d={d}
              style={
                runId > 0
                  ? { animation: `zero-sun-ray-fade 0.3s ease ${(index + 1) * 0.1}s both` }
                  : undefined
              }
            />
          ))}
        </svg>
      </div>
    );
  },
);

SunIcon.displayName = 'SunIcon';

export { SunIcon };

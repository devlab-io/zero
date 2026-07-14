import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from 'react';

export interface SquarePenIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

// #44 (gate A8): motion/react removed so this icon no longer pulls the `motion` chunk into the
// critical inbox path. The pen wobble (rotate + translate) is implemented with a self-contained CSS
// keyframe on the pen path. `runId` increments on every start/hover-enter and keys the animated
// path, so a keyed remount re-runs the CSS animation from the start on each call — even when it is
// already running. The SquarePenIconHandle (startAnimation/stopAnimation) and the mouse-enter/leave
// triggers are retained.
const SquarePenIcon = forwardRef<SquarePenIconHandle, HTMLAttributes<HTMLDivElement>>(
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
        className="hover:bg-accent/10 flex cursor-pointer select-none items-center justify-center rounded-md transition-colors duration-200"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <style>
          {
            '@keyframes zero-pen-wobble{0%{transform:rotate(0deg) translate(0,0)}33%{transform:rotate(0.5deg) translate(-1px,1.5px)}66%{transform:rotate(-0.5deg) translate(1.5px,-1px)}100%{transform:rotate(0deg) translate(0,0)}}'
          }
        </style>
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
          style={{ overflow: 'visible' }}
        >
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path
            key={runId}
            d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"
            style={runId > 0 ? { animation: 'zero-pen-wobble 0.8s ease-in-out' } : undefined}
          />
        </svg>
      </div>
    );
  },
);

SquarePenIcon.displayName = 'SquarePenIcon';

export { SquarePenIcon };

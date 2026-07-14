// Source: https://motion-primitives.com/docs/text-shimmer
//
// w2cd (client weight): rewritten off `motion/react`. The only animated property was
// `backgroundPosition` (a linear infinite sweep), which a CSS keyframe reproduces
// exactly. The gradient / spread styling is unchanged. A single self-contained
// (display:none) <style> carries the keyframe so no global CSS is touched; identical
// duplicate <style> tags across instances are harmless and SSR-safe. The keyframe text
// is a static compile-time constant (no user input) — no injection surface.

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

export type TextShimmerProps = {
  children: string;
  as?: React.ElementType;
  className?: string;
  duration?: number;
  spread?: number;
};

const SHIMMER_KEYFRAMES =
  '@keyframes w2cd-text-shimmer{from{background-position:100% center}to{background-position:0% center}}';

export function TextShimmer({
  children,
  as: Component = 'p',
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const dynamicSpread = useMemo(() => {
    return children.length * spread;
  }, [children, spread]);

  return (
    <>
      <style>{SHIMMER_KEYFRAMES}</style>
      <Component
        className={cn(
          'relative inline-block bg-size-[250%_100%,auto] bg-clip-text',
          'text-transparent [--base-color:#a1a1aa] [--base-gradient-color:#000]',
          '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]',
          'dark:[--base-color:#71717a] dark:[--base-gradient-color:#ffffff] dark:[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]',
          className,
        )}
        style={
          {
            '--spread': `${dynamicSpread}px`,
            backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`,
            backgroundPosition: '100% center',
            animation: `w2cd-text-shimmer ${duration}s linear infinite`,
          } as React.CSSProperties
        }
      >
        {children}
      </Component>
    </>
  );
}

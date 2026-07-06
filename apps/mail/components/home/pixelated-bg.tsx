import type { ImgHTMLAttributes } from 'react';

// perf: these decorative backgrounds used to be inline SVGs carrying ~120 kB of
// base64 PNG data in the JS bundle. The exact same SVG documents now live in
// /public (pixelated-*.svg, generated from the previous components with
// react-dom/server renderToStaticMarkup) and are referenced as images, which
// removes them from the JS critical path without any visual change.

type PixelatedProps = ImgHTMLAttributes<HTMLImageElement>;

export function PixelatedBackground(props: PixelatedProps) {
  return (
    <img
      src="/pixelated-bg.svg"
      alt=""
      aria-hidden="true"
      width={1440}
      height={447}
      decoding="async"
      {...props}
    />
  );
}

export function PixelatedLeft(props: PixelatedProps) {
  return (
    <img
      src="/pixelated-left.svg"
      alt=""
      aria-hidden="true"
      width={118}
      height={466}
      decoding="async"
      {...props}
    />
  );
}

export function PixelatedRight(props: PixelatedProps) {
  return (
    <img
      src="/pixelated-right.svg"
      alt=""
      aria-hidden="true"
      width={119}
      height={466}
      decoding="async"
      {...props}
    />
  );
}

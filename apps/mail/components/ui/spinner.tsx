// w2cd (client weight): rewritten off `motion/react` to a pure CSS-animated SVG.
// This is a shell-eager component (LoadingProvider renders it), so its former static
// `motion` import pulled framer/motion into the critical bundle via the shell. The CSS
// version is visually equivalent — a rotating partial ring — with zero runtime dep.
interface SpinnerProps {
  size?: number;
  color?: string;
}

export const Spinner = ({ size = 24, color = 'currentColor' }: SpinnerProps) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.7 1"
      />
    </svg>
  );
};

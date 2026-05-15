import { useMemo } from "react";

interface Props {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
}

export const SPARKLINE_DEFAULT_WIDTH = 100;
export const SPARKLINE_DEFAULT_HEIGHT = 16;

// buildPath maps `data` to an SVG `d` attribute. Constant data (max=0 or
// every point equal) collapses to a flat baseline rather than NaN — a
// brand-new agent or a quiet hour stays a visible line, not a void.
export function buildPath(
  data: number[],
  width: number,
  height: number,
): string {
  if (data.length === 0) return "";
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const baseline = height - 1;

  if (range === 0) {
    return `M 0 ${baseline} L ${width} ${baseline}`;
  }

  return data
    .map((v, i) => {
      const x = i * step;
      const y = baseline - ((v - min) / range) * (height - 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({
  data,
  width = SPARKLINE_DEFAULT_WIDTH,
  height = SPARKLINE_DEFAULT_HEIGHT,
  className,
  ariaLabel,
}: Props) {
  const path = useMemo(() => buildPath(data, width, height), [data, width, height]);
  if (data.length === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={className}
      data-testid="sparkline"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

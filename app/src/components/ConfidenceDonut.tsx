interface Props {
  score: number;
  size?: number;
}

// ConfidenceDonut encodes a 0-100 score as a filled arc. Was tri-color
// (green/amber/red) — the polish pass collapses to single-accent: vigil-
// accent for the filled portion, vigil-rule for the empty portion. The
// score number itself is the precision; the donut is the at-a-glance.
// data-confidence-tier surfaces low/med/high for tests that previously
// asserted on color.
export function ConfidenceDonut({ score, size = 48 }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const inner = size - 12;
  const tier = clamped >= 75 ? "high" : clamped >= 50 ? "med" : "low";
  return (
    <div
      data-ring
      data-confidence-tier={tier}
      className="relative flex items-center justify-center shrink-0 text-vigil-accent"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundImage: `conic-gradient(currentColor 0 ${clamped}%, rgba(255,255,255,0.08) ${clamped}% 100%)`,
      }}
    >
      <div
        className="flex items-center justify-center bg-vigil-bg text-vigil-ink font-medium tabular-nums"
        style={{
          width: inner,
          height: inner,
          borderRadius: "50%",
          fontSize: "13px",
        }}
      >
        {clamped}
      </div>
    </div>
  );
}

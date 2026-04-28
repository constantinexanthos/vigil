interface Props {
  score: number;
  size?: number; // diameter in px
}

export function ConfidenceDonut({ score, size = 52 }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = clamped >= 75 ? "#4ade80" : clamped >= 50 ? "#fbbf24" : "#ef4444";
  const inner = size - 14;

  return (
    <div
      data-ring
      className="relative flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        backgroundImage: `conic-gradient(${color} 0 ${clamped}%, rgba(255,255,255,0.08) ${clamped}% 100%)`,
      }}
    >
      <div
        className="flex items-center justify-center bg-[#0e0e10] text-white font-semibold tabular-nums"
        style={{ width: inner, height: inner, borderRadius: "50%", fontSize: "14px" }}
      >
        {clamped}
      </div>
    </div>
  );
}

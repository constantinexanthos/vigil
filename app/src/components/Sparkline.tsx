interface SparklineProps {
  data: number[];
  color: string;
}

export default function Sparkline({ data, color }: SparklineProps) {
  const width = 90;
  const height = 18;
  const barWidth = 2;
  const gap = 1;
  const maxVal = Math.max(...data, 1);

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      {data.map((value, i) => {
        const barHeight = value === 0 ? 1 : Math.max(2, (value / maxVal) * height);
        const x = i * (barWidth + gap);
        const y = height - barHeight;

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={color}
            opacity={0.4}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
}

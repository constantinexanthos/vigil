interface SparklineProps {
  data: number[];
  color: string;
}

export default function Sparkline({ data, color }: SparklineProps) {
  const width = 80;
  const height = 20;
  const barWidth = 2;
  const gap = 1;
  const maxVal = Math.max(...data, 1);

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      {data.map((value, i) => {
        const barHeight = value === 0 ? 1 : Math.max(2, (value / maxVal) * height);
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        const isRecent = i >= data.length - 3;
        const opacity = isRecent ? 1 : 0.4;

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill={color}
            opacity={opacity}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
}

import type { HourBucket } from "../../../types";

interface Props {
  buckets: HourBucket[];
  now: Date;
}

const HOURS = 24;
const CHART_HEIGHT = 64;
const MIN_BAR_PX = 1;

function floorHour(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

function hourIso(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:00:00Z`;
}

export function densifyBuckets(api: HourBucket[], now: Date): HourBucket[] {
  const map = new Map<string, HourBucket>();
  for (const b of api) map.set(b.hour_iso, b);

  const result: HourBucket[] = [];
  const start = floorHour(now);
  start.setUTCHours(start.getUTCHours() - (HOURS - 1));
  for (let i = 0; i < HOURS; i++) {
    const h = new Date(start);
    h.setUTCHours(h.getUTCHours() + i);
    const iso = hourIso(h);
    result.push(map.get(iso) ?? { hour_iso: iso, by_agent: [] });
  }
  return result;
}

// HourlyChart shows the last 24 hours of activity as a single-accent bar
// chart — Honeycomb-style restraint. Pre-polish version stacked per-agent
// segments in distinct hues; that visual could read 5+ colors at a glance.
// The polish pass drops the per-agent split (still surfaced via tooltip +
// the sr-only table); the chart now reads as one quiet trend line.
export function HourlyChart({ buckets, now }: Props) {
  const dense = densifyBuckets(buckets, now);
  const totalEvents = dense.reduce(
    (s, b) => s + b.by_agent.reduce((s2, a) => s2 + a.count, 0),
    0,
  );

  if (totalEvents === 0) {
    return (
      <div className="px-4 py-4 text-[12px] text-vigil-mute">
        Activity will populate as your agents work.
      </div>
    );
  }

  const totals = dense.map((b) => b.by_agent.reduce((s, a) => s + a.count, 0));
  const max = Math.max(1, ...totals);
  const tickLabels = ["00:00", "06:00", "12:00", "18:00", "now"];

  return (
    <div className="px-4 py-2">
      <svg
        role="img"
        aria-label="24-hour activity chart"
        viewBox={`0 0 ${HOURS * 10} ${CHART_HEIGHT + 10}`}
        preserveAspectRatio="none"
        className="w-full text-vigil-accent"
        style={{ height: CHART_HEIGHT + 16 }}
      >
        {dense.map((bucket, i) => {
          const count = totals[i];
          const barH =
            count === 0
              ? 0
              : Math.max(MIN_BAR_PX, (count / max) * CHART_HEIGHT);
          const x = i * 10;
          const y = CHART_HEIGHT - barH;
          const agentBreakdown = bucket.by_agent
            .map((a) => `${a.agent}: ${a.count}`)
            .join(", ");
          return (
            <g key={bucket.hour_iso} transform={`translate(${x}, 0)`}>
              <rect
                x={1}
                y={y}
                width={8}
                height={barH}
                fill="currentColor"
                fillOpacity={count === 0 ? 0 : 0.7}
              >
                <title>{`${bucket.hour_iso} — ${count} event${count === 1 ? "" : "s"}${agentBreakdown ? ` (${agentBreakdown})` : ""}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-vigil-mute mt-1 px-1 tabular-nums">
        {tickLabels.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Hour (UTC)</th>
            <th>Agent</th>
            <th>Events</th>
          </tr>
        </thead>
        <tbody>
          {dense.flatMap((b) =>
            b.by_agent.map((a) => (
              <tr key={`${b.hour_iso}-${a.agent}`}>
                <td>{b.hour_iso}</td>
                <td>{a.agent}</td>
                <td>{a.count}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

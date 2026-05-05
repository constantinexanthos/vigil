import { agentColor } from "../../../types";
import type { HourBucket } from "../../../types";

interface Props {
  buckets: HourBucket[];
  now: Date;
}

const HOURS = 24;
const CHART_HEIGHT = 84;
const MIN_SEGMENT_PX = 2;

/** Floor a Date to the start of its hour (mutating-safe — returns a new Date). */
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

/**
 * Densify API output to 24 contiguous hourly buckets ending at `now`.
 * Empty hours get `by_agent: []`.
 */
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

export function HourlyChart({ buckets, now }: Props) {
  const dense = densifyBuckets(buckets, now);
  const totalEvents = dense.reduce(
    (s, b) => s + b.by_agent.reduce((s2, a) => s2 + a.count, 0),
    0,
  );

  if (totalEvents === 0) {
    return (
      <div className="px-5 py-6 text-center">
        <div className="h-px bg-white/10 mb-3" />
        <p className="text-[12px] text-white/45">
          Activity will populate as your agents work.
        </p>
      </div>
    );
  }

  const maxBucketTotal = Math.max(
    1,
    ...dense.map((b) => b.by_agent.reduce((s, a) => s + a.count, 0)),
  );

  const tickLabels = ["00:00", "06:00", "12:00", "18:00", "now"];

  return (
    <div className="px-5 py-3">
      <svg
        role="img"
        aria-label="24-hour activity chart"
        viewBox={`0 0 ${HOURS * 10} ${CHART_HEIGHT + 10}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: CHART_HEIGHT + 24 }}
      >
        {dense.map((bucket, i) => {
          const total = bucket.by_agent.reduce((s, a) => s + a.count, 0);
          const x = i * 10;
          let yCursor = CHART_HEIGHT;
          return (
            <g key={bucket.hour_iso} transform={`translate(${x}, 0)`}>
              {bucket.by_agent.map((seg) => {
                const proportional = (seg.count / maxBucketTotal) * CHART_HEIGHT;
                const segH = total > 0 ? Math.max(MIN_SEGMENT_PX, proportional) : 0;
                yCursor -= segH;
                return (
                  <rect
                    key={seg.agent}
                    x={1}
                    y={yCursor}
                    width={8}
                    height={segH}
                    fill={agentColor(seg.agent)}
                  >
                    <title>{`${bucket.hour_iso} — ${seg.agent}: ${seg.count}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[9px] text-white/35 mt-1 px-1 tabular-nums">
        {tickLabels.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {/* Hidden table mirror for screen readers */}
      <table className="sr-only">
        <thead>
          <tr><th>Hour (UTC)</th><th>Agent</th><th>Events</th></tr>
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

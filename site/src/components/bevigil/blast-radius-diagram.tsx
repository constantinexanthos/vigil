// Second-hero visual for the home page: blast-radius / scoped permissions.
// Reinforces a different concept than the hero diagram (which shows the
// data path): here we show that each agent's reachable surface area is
// scoped at the proxy, not at the prompt level.
//
// Same single-accent-cyan, same 1px line work, same monospaced labels
// as ArchitectureDiagram so the page reads as one design language.

const ACCENT = "#0891b2"
const ACCENT_SOFT = "rgba(8, 145, 178, 0.06)"
const ACCENT_FAINT = "rgba(8, 145, 178, 0.30)"
const TEXT = "#0c0a09"
const MUTED = "#57534e"
const FAINT = "#a8a29e"
const BORDER = "#e7e5e4"

export function BlastRadiusDiagram() {
  return (
    <figure
      aria-label="Each agent runs inside a scope of allowed actions; Vigil enforces the scope, not the prompt"
      className="relative w-full"
    >
      <svg
        viewBox="0 0 720 360"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full h-auto"
        role="img"
      >
        <title>
          Each agent runs inside a scope it can&rsquo;t escape
        </title>

        {/* Outer scope: full database surface */}
        <g>
          <text
            x="40"
            y="40"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={FAINT}
          >
            FULL DATABASE
          </text>
          <rect
            x={40}
            y={50}
            width={640}
            height={278}
            rx={6}
            fill="#ffffff"
            stroke={BORDER}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        </g>

        {/* Mid scope: read-only */}
        <g>
          <text
            x="64"
            y="84"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={ACCENT}
          >
            READ-ONLY SCOPE
          </text>
          <rect
            x={64}
            y={94}
            width={592}
            height={210}
            rx={5}
            fill={ACCENT_SOFT}
            stroke={ACCENT_FAINT}
            strokeWidth={1}
          />
        </g>

        {/* Inner scope: refactor agent — narrow, precise */}
        <g>
          <text
            x="92"
            y="128"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={ACCENT}
          >
            REFACTOR AGENT
          </text>
          <rect
            x={92}
            y={138}
            width={244}
            height={150}
            rx={4}
            fill="#ffffff"
            stroke={ACCENT}
            strokeWidth={1.5}
          />
          <text
            x={108}
            y={166}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="11"
            fill={TEXT}
          >
            SELECT
          </text>
          <text
            x={108}
            y={186}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="11"
            fill={TEXT}
          >
            UPDATE (src/*)
          </text>
          <text
            x={108}
            y={262}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            fill={MUTED}
          >
            cannot DELETE · cannot touch
          </text>
          <text
            x={108}
            y={278}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            fill={MUTED}
          >
            migrations · cannot DROP
          </text>
        </g>

        {/* Inner scope: analytics agent — read-only */}
        <g>
          <text
            x="384"
            y="128"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={ACCENT}
          >
            ANALYTICS AGENT
          </text>
          <rect
            x={384}
            y={138}
            width={244}
            height={150}
            rx={4}
            fill="#ffffff"
            stroke={ACCENT}
            strokeWidth={1.5}
          />
          <text
            x={400}
            y={166}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="11"
            fill={TEXT}
          >
            SELECT (replica)
          </text>
          <text
            x={400}
            y={186}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="11"
            fill={TEXT}
          >
            EXPLAIN
          </text>
          <text
            x={400}
            y={262}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            fill={MUTED}
          >
            cannot WRITE · cannot read
          </text>
          <text
            x={400}
            y={278}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            fill={MUTED}
          >
            auth tables · sample 1%
          </text>
        </g>

        {/* Footer caption */}
        <text
          x={360}
          y={350}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="10"
          letterSpacing="1.5"
          fill={TEXT}
        >
          enforced at the proxy, not in the prompt
        </text>
      </svg>
    </figure>
  )
}

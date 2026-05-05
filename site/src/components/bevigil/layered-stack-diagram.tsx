// Differentiation visual for the home page positioning section.
// Replaces the previous "what we are NOT" text-list (which named
// competitors directly). The diagram shows visually that Vigil sits
// in the request path while orchestration / observability / identity
// tools sit adjacent to it. Different layer, different job — without
// naming a single brand.
//
// Same line-work + accent pattern as ArchitectureDiagram and
// BlastRadiusDiagram so the page reads as one design language.
//
// Layout:
//   AGENTS  ─────────── full width, neutral
//      │   (request-path spine)
//      │       ┌─ ADJACENT TOOLS  (right side, ~60% opacity, dashed)
//      │ ╌╌╌╌╌╌┤  Orchestration · Observability · Identity
//      │       └─
//      ▼
//   VIGIL   ─────────── full width, cyan accent (the only colored row)
//      │
//      ▼
//   YOUR SYSTEMS ──────  full width, neutral

const ACCENT = "#0891b2"
const ACCENT_SOFT = "rgba(8, 145, 178, 0.08)"
const TEXT = "#0c0a09"
const MUTED = "#57534e"
const FAINT = "#a8a29e"
const BORDER = "#e7e5e4"
const ADJACENT_OPACITY = 0.6

export function LayeredStackDiagram() {
  return (
    <figure
      aria-label="Vigil sits in the request path between agents and your systems; orchestration, observability, and identity tools sit adjacent to it"
      className="relative w-full"
    >
      <svg
        viewBox="0 0 720 500"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full h-auto"
        role="img"
      >
        <title>
          Vigil sits in the request path; adjacent tools sit beside it
        </title>

        {/* AGENTS — top row, full width, neutral */}
        <g>
          <text
            x={40}
            y={26}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={FAINT}
          >
            AGENTS
          </text>
          <rect
            x={40}
            y={36}
            width={640}
            height={60}
            rx={4}
            fill="#ffffff"
            stroke={BORDER}
            strokeWidth={1}
          />
          <text
            x={360}
            y={72}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="12"
            fill={MUTED}
          >
            Claude Code · Cursor · Codex · Copilot · Cline · and more
          </text>
        </g>

        {/* Spine: solid vertical request-path connector running down the
            left-of-center axis. Solid (not dashed) because the spine IS
            the request path. */}
        <g stroke={FAINT} strokeWidth={1} fill="none">
          <path d="M240 96 L240 250" />
        </g>

        {/* Arrowhead pointing into VIGIL */}
        <g fill={FAINT} stroke="none">
          <path d="M240 250 L235 240 L245 240 Z" />
        </g>

        {/* Adjacent box — lives off to the RIGHT of the spine in the gap
            between AGENTS and VIGIL. Lower opacity + dashed border
            communicates "observes/integrates, not in-line".

            We wrap the entire group in opacity so border + text + connector
            all dim together. */}
        <g opacity={ADJACENT_OPACITY}>
          {/* Dashed connector from spine -> adjacent box */}
          <path
            d="M240 175 L320 175"
            stroke={FAINT}
            strokeWidth={1}
            strokeDasharray="3 3"
            fill="none"
          />

          <text
            x={336}
            y={120}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={FAINT}
          >
            ADJACENT
          </text>
          <rect
            x={320}
            y={130}
            width={360}
            height={100}
            rx={4}
            fill="#ffffff"
            stroke={FAINT}
            strokeWidth={1}
            strokeDasharray="4 3"
          />

          {/* Three rows: category label (left) + role description (right) */}
          {[
            { y: 156, label: "Orchestration", role: "spawns and routes agents" },
            { y: 182, label: "Observability", role: "watches what agents did" },
            { y: 208, label: "Identity", role: "knows who agents are" },
          ].map((row) => (
            <g key={row.label}>
              <text
                x={336}
                y={row.y}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize="11"
                fill={TEXT}
              >
                {row.label}
              </text>
              <text
                x={478}
                y={row.y}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize="11"
                fill={MUTED}
              >
                {row.role}
              </text>
            </g>
          ))}
        </g>

        {/* VIGIL — middle row, full width, cyan accent (only colored row).
            This is the in-the-request-path layer. */}
        <g>
          <text
            x={40}
            y={262}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={ACCENT}
          >
            VIGIL
          </text>
          {/* Left edge accent bar */}
          <rect
            x={40}
            y={272}
            width={4}
            height={70}
            fill={ACCENT}
          />
          <rect
            x={44}
            y={272}
            width={636}
            height={70}
            rx={4}
            fill={ACCENT_SOFT}
            stroke={ACCENT}
            strokeWidth={1.5}
          />
          <text
            x={360}
            y={300}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="13"
            fontWeight={600}
            fill={ACCENT}
          >
            agent-aware data plane
          </text>
          <text
            x={360}
            y={322}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="11"
            fill={ACCENT}
          >
            identity · rate-limit · coalesce · blast-radius · audit
          </text>
        </g>

        {/* Spine: VIGIL -> YOUR SYSTEMS */}
        <g stroke={FAINT} strokeWidth={1} fill="none">
          <path d="M240 342 L240 396" />
        </g>
        <g fill={FAINT} stroke="none">
          <path d="M240 396 L235 386 L245 386 Z" />
        </g>

        {/* YOUR SYSTEMS — bottom row, full width, neutral */}
        <g>
          <text
            x={40}
            y={412}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={FAINT}
          >
            YOUR SYSTEMS
          </text>
          <rect
            x={40}
            y={422}
            width={640}
            height={50}
            rx={4}
            fill="#ffffff"
            stroke={BORDER}
            strokeWidth={1}
          />
          <text
            x={360}
            y={452}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="12"
            fill={MUTED}
          >
            postgres · redis · APIs · gRPC · services
          </text>
        </g>

        {/* Footer caption — same voice and weight as the hero diagram's
            "one binary, in the data path" caption. */}
        <text
          x={360}
          y={492}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="10"
          letterSpacing="1.5"
          fill={TEXT}
        >
          in the request path, not adjacent to it
        </text>
      </svg>
    </figure>
  )
}

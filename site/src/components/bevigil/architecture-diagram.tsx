// Hero visual for the home page.
// Three layers stacked vertically: agents -> Vigil -> data stores.
// The middle row is highlighted in cyan because that's where Vigil sits.
// Single SVG, no external assets. Monospaced labels.

const ACCENT = "#0891b2"
const ACCENT_SOFT = "rgba(8, 145, 178, 0.08)"
const TEXT = "#0c0a09"
const MUTED = "#57534e"
const FAINT = "#a8a29e"
const BORDER = "#e7e5e4"

export function ArchitectureDiagram() {
  return (
    <figure
      aria-label="Vigil sits between AI agents and your databases, APIs, and services"
      className="relative w-full"
    >
      <svg
        viewBox="0 0 720 360"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full h-auto"
        role="img"
      >
        <title>Vigil sits between AI agents and your data stores</title>

        {/* Top layer: agents */}
        <g>
          <text
            x="40"
            y="48"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={FAINT}
          >
            AGENTS
          </text>
          {[
            { x: 40, label: "Claude Code" },
            { x: 154, label: "Cursor" },
            { x: 268, label: "Codex" },
            { x: 382, label: "Copilot" },
            { x: 496, label: "Cline" },
            { x: 610, label: "and more" },
          ].map((node) => (
            <g key={node.label}>
              <rect
                x={node.x}
                y={62}
                width={90}
                height={42}
                rx={4}
                fill="#ffffff"
                stroke={BORDER}
                strokeWidth={1}
              />
              <text
                x={node.x + 45}
                y={88}
                textAnchor="middle"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize="11"
                fill={MUTED}
              >
                {node.label}
              </text>
            </g>
          ))}
        </g>

        {/* Connectors top -> middle */}
        <g stroke={FAINT} strokeWidth={1} fill="none">
          <path d="M85 104 L85 150" />
          <path d="M199 104 L199 150" />
          <path d="M313 104 L313 150" />
          <path d="M427 104 L427 150" />
          <path d="M541 104 L541 150" />
          <path d="M655 104 L655 150" />
        </g>

        {/* Middle layer: Vigil */}
        <g>
          <text
            x="40"
            y="142"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={ACCENT}
          >
            VIGIL
          </text>
          <rect
            x={60}
            y={156}
            width={640}
            height={48}
            rx={4}
            fill={ACCENT_SOFT}
            stroke={ACCENT}
            strokeWidth={1.5}
          />
          <text
            x={380}
            y={184}
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="13"
            fontWeight={600}
            fill={ACCENT}
          >
            identity · rate-limit · coalesce · blast-radius · audit
          </text>
        </g>

        {/* Connectors middle -> bottom */}
        <g stroke={FAINT} strokeWidth={1} fill="none">
          <path d="M120 204 L120 250" />
          <path d="M260 204 L260 250" />
          <path d="M400 204 L400 250" />
          <path d="M540 204 L540 250" />
          <path d="M640 204 L640 250" />
        </g>

        {/* Bottom layer: data stores */}
        <g>
          <text
            x="40"
            y="242"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="2"
            fill={FAINT}
          >
            DATA PATH
          </text>
          {[
            { x: 80, label: "postgres" },
            { x: 220, label: "redis" },
            { x: 360, label: "rest API" },
            { x: 500, label: "gRPC" },
            { x: 600, label: "services" },
          ].map((node) => (
            <g key={node.label}>
              <rect
                x={node.x}
                y={258}
                width={80}
                height={42}
                rx={4}
                fill="#ffffff"
                stroke={BORDER}
                strokeWidth={1}
              />
              <text
                x={node.x + 40}
                y={284}
                textAnchor="middle"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize="11"
                fill={MUTED}
              >
                {node.label}
              </text>
            </g>
          ))}
        </g>

        {/* Footer caption */}
        <text
          x={360}
          y={336}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="10"
          letterSpacing="1.5"
          fill={TEXT}
        >
          one binary, in the data path
        </text>
      </svg>
    </figure>
  )
}

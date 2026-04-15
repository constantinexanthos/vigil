const AGENT_LOGOS: Record<string, string> = {
  "claude-code": "/agents/claude.svg",
  cursor: "/agents/cursor.webp",
  conductor: "/agents/conductor.svg",
  aider: "/agents/aider.png",
  codex: "/agents/codex.webp",
  cline: "/agents/cline.png",
  chatgpt: "/agents/chatgpt.webp",
  windsurf: "/agents/windsurf.png",
};

interface AgentLogoProps {
  agent: string;
  size?: number;
}

export default function AgentLogo({ agent, size = 20 }: AgentLogoProps) {
  const src = AGENT_LOGOS[agent];

  if (!src) {
    return (
      <span
        className="inline-flex items-center justify-center rounded flex-shrink-0"
        style={{ width: size, height: size, background: "#3A3A3C", fontSize: size * 0.55, color: "#9CA3AF" }}
      >
        {agent.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={agent}
      className="flex-shrink-0"
      style={{ width: size, height: size, borderRadius: 4 }}
    />
  );
}

const AGENT_LOGOS: Record<string, string> = {
  "claude-code": "/agents/claude.svg",
  cursor: "/agents/cursor.webp",
  conductor: "/agents/conductor.png",
  aider: "/agents/aider.png",
  codex: "/agents/codex.webp",
  cline: "/agents/cline.png",
  chatgpt: "/agents/chatgpt.webp",
  windsurf: "/agents/windsurf.png",
};

interface AgentLogoProps {
  agent: string;
}

export default function AgentLogo({ agent }: AgentLogoProps) {
  const src = AGENT_LOGOS[agent];

  if (!src) {
    return (
      <span
        className="inline-block w-4 h-4 rounded-full flex-shrink-0"
        style={{ background: "#52525b" }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={agent}
      className="w-4 h-4 flex-shrink-0"
    />
  );
}

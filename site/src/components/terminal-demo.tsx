"use client";

import { useState } from "react";

const LINES = [
  { text: "$ vigil status", style: "text-text-muted" },
  { text: "", style: "" },
  { text: "AGENTS", style: "text-cyan font-semibold" },
  {
    text: "----------------------------------------",
    style: "text-border",
  },
  { text: "  claude-code    pid 48201  ~/projects/vigil", style: "text-text" },
  { text: "  cursor         pid 51092  ~/projects/vigil", style: "text-text" },
  { text: "  aider          pid 53887  ~/projects/api", style: "text-text" },
  { text: "", style: "" },
  { text: "COLLISIONS (last 5 min)", style: "text-cyan font-semibold" },
  {
    text: "----------------------------------------",
    style: "text-border",
  },
  {
    text: "  src/main.rs -- [claude-code, cursor]",
    style: "text-amber-400",
  },
  { text: "", style: "" },
  {
    text: "3 agents active, 1 collision detected",
    style: "text-text-muted",
  },
];

export default function TerminalDemo() {
  return (
    <div className="w-full rounded-lg border border-border bg-surface overflow-hidden shadow-2xl shadow-cyan/5">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-xs text-text-muted font-mono">vigil</span>
      </div>

      {/* Terminal body */}
      <div className="p-4 sm:p-6 font-mono text-sm leading-relaxed min-h-[340px]">
        {LINES.map((line, i) => (
          <div
            key={i}
            className={`terminal-line ${line.style}`}
            style={{ animationDelay: `${i * 200}ms` }}
          >
            {line.text || "\u00A0"}
          </div>
        ))}
        <span
          className="terminal-line inline-block w-2 h-4 bg-cyan cursor-blink mt-1"
          style={{ animationDelay: `${LINES.length * 200}ms` }}
        />
      </div>
    </div>
  );
}

export function InstallCommand() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText("brew install vigil");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className={`
        group flex items-center gap-3 px-5 py-3 rounded-md border border-border
        bg-surface font-mono text-sm transition-colors
        hover:border-cyan/40 hover:bg-surface/80 cursor-pointer
        ${copied ? "copy-flash" : ""}
      `}
    >
      <span className="text-text-muted">$</span>
      <span className="text-cyan">brew install vigil</span>
      <span className="ml-2 text-text-muted text-xs transition-colors group-hover:text-text">
        {copied ? "copied" : "click to copy"}
      </span>
    </button>
  );
}

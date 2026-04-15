import { useState } from "react";
import DiffViewer from "./DiffViewer";
import { formatCost, truncatePath } from "../types";
import type { SessionGroup, SessionFile } from "../types";

interface SessionDetailProps {
  session: SessionGroup;
}

const BUILD_ARTIFACT_PATTERNS = ["/target/", "/build/", "/node_modules/", "/dist/", "/.next/"];

function confidenceExplanation(score: number): string {
  if (score >= 80) return "Clean session with good patterns";
  if (score >= 60) return "Some patterns worth reviewing";
  if (score >= 40) return "Multiple concerns detected";
  return "Careful review recommended";
}

function confidenceColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#fbbf24";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

const EXT_LABELS: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
  rs: "Rust", py: "Python", css: "CSS", html: "HTML", json: "JSON",
  md: "Markdown", toml: "TOML", yaml: "YAML", yml: "YAML", sql: "SQL",
  sh: "Shell", go: "Go", java: "Java", rb: "Ruby", swift: "Swift",
};

function buildPlainSummary(files: SessionFile[]): string | null {
  if (files.length === 0) return null;

  const created = files.filter(f => f.kind === "file_create").length;
  const modified = files.filter(f => f.kind === "file_modify" || f.kind === "file_write").length;
  const deleted = files.filter(f => f.kind === "file_delete").length;

  // Get unique extensions
  const exts = new Map<string, number>();
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    const filename = parts[parts.length - 1] ?? "";
    const dotIdx = filename.lastIndexOf(".");
    const ext = dotIdx >= 0 ? filename.slice(dotIdx + 1) : "";
    const label = EXT_LABELS[ext] ?? ext;
    if (label) exts.set(label, (exts.get(label) ?? 0) + 1);
    if (parts.length > 1) {
      dirs.add(parts.slice(-3, -1).join("/"));
    }
  }

  const parts: string[] = [];
  if (created > 0) parts.push(`Created ${created} file${created !== 1 ? "s" : ""}`);
  if (modified > 0) parts.push(`Modified ${modified} file${modified !== 1 ? "s" : ""}`);
  if (deleted > 0) parts.push(`Deleted ${deleted} file${deleted !== 1 ? "s" : ""}`);

  const topExts = Array.from(exts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topExts.length > 0) {
    parts.push(`(${topExts.map(([name]) => name).join(", ")})`);
  }

  const topDirs = Array.from(dirs).slice(0, 2);
  if (topDirs.length > 0) {
    parts.push(`in ${topDirs.join(", ")}`);
  }

  return parts.join(" ");
}

export default function SessionDetail({ session }: SessionDetailProps) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const visibleFiles = session.files.filter(
    (f) => !BUILD_ARTIFACT_PATTERNS.some((p) => f.path.includes(p)),
  );

  const plainSummary = buildPlainSummary(visibleFiles);
  const totalAdded = visibleFiles.reduce((sum, f) => sum + (f.added || 0), 0);
  const totalRemoved = visibleFiles.reduce((sum, f) => sum + (f.removed || 0), 0);

  return (
    <div style={{
      background: "#151518",
      borderTop: "1px solid #232530",
      padding: "16px 20px 16px 28px",
    }}>
      {/* Plain-English summary */}
      {plainSummary && (
        <div style={{
          fontSize: "13px",
          color: "#a1a1aa",
          marginBottom: "12px",
          lineHeight: "18px",
        }}>
          {plainSummary}
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: "flex",
        gap: "24px",
        marginBottom: "16px",
        fontSize: "12px",
      }}>
        {/* Confidence */}
        {session.confidence > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: confidenceColor(session.confidence),
            }} />
            <span style={{ color: "#d4d4d8" }}>
              {session.confidence}/100
            </span>
            <span style={{ color: "#71717a" }}>
              {confidenceExplanation(session.confidence)}
            </span>
          </div>
        )}

        {/* Cost */}
        <div style={{ color: "#71717a" }}>
          Cost: {session.costUsd > 0 ? (
            <span style={{ color: "#d4d4d8" }}>{formatCost(session.costUsd)}</span>
          ) : (
            <span>{"\u2014"}</span>
          )}
        </div>

        {/* Total diff stats */}
        {(totalAdded > 0 || totalRemoved > 0) && (
          <div style={{ fontFamily: "IBM Plex Mono, monospace" }}>
            {totalAdded > 0 && <span style={{ color: "#4ade80" }}>+{totalAdded}</span>}
            {totalAdded > 0 && totalRemoved > 0 && <span style={{ color: "#71717a" }}> / </span>}
            {totalRemoved > 0 && <span style={{ color: "#ef4444" }}>-{totalRemoved}</span>}
          </div>
        )}
      </div>

      {/* File list */}
      {visibleFiles.length > 0 && (
        <div style={{
          borderRadius: "6px",
          overflow: "hidden",
          border: "1px solid #232530",
        }}>
          {visibleFiles.map((file, i) => (
            <div key={file.path}>
              <div
                onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  cursor: "pointer",
                  background: expandedFile === file.path ? "#1c1e2a" : "transparent",
                  borderBottom: i < visibleFiles.length - 1 || expandedFile === file.path ? "1px solid #232530" : "none",
                  transition: "background 150ms",
                }}
                onMouseEnter={e => { if (expandedFile !== file.path) (e.currentTarget.style.background = "#18181b") }}
                onMouseLeave={e => { if (expandedFile !== file.path) (e.currentTarget.style.background = "transparent") }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#52525b", fontSize: "10px" }}>
                    {expandedFile === file.path ? "▾" : "▸"}
                  </span>
                  <span style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: "13px",
                    color: "#a1a1aa",
                  }}>
                    {truncatePath(file.path)}
                  </span>
                </div>
                <span style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: "12px",
                  display: "flex",
                  gap: "8px",
                  flexShrink: 0,
                  marginLeft: "12px",
                }}>
                  {file.added > 0 && <span style={{ color: "#4ade80" }}>+{file.added}</span>}
                  {file.removed > 0 && <span style={{ color: "#ef4444" }}>-{file.removed}</span>}
                  {!file.added && !file.removed && <span style={{ color: "#52525b" }}>~</span>}
                </span>
              </div>
              {expandedFile === file.path && <DiffViewer diff={file.diff} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

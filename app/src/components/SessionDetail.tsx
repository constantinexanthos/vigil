import { useState } from "react";
import DiffViewer from "./DiffViewer";
import { formatCost, truncatePath } from "../types";
import type { SessionGroup, SessionFile } from "../types";

const BUILD_ARTIFACT_PATTERNS = ["/target/", "/build/", "/node_modules/", "/dist/", "/.next/"];

function confidenceExplanation(score: number): string {
  if (score >= 80) return "High confidence \u2014 clean session with good patterns";
  if (score >= 60) return "Moderate confidence \u2014 some patterns worth reviewing";
  if (score >= 40) return "Low confidence \u2014 multiple concerns detected";
  return "Very low confidence \u2014 careful review recommended";
}

const EXT_LABELS: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
  rs: "Rust", py: "Python", css: "CSS", html: "HTML", json: "JSON",
  md: "Markdown", toml: "TOML", yaml: "YAML", yml: "YAML",
  sql: "SQL", sh: "shell", go: "Go", java: "Java", rb: "Ruby", swift: "Swift",
};

function actionLabel(kind: string): string {
  if (kind === "file_create") return "created";
  if (kind === "file_delete") return "deleted";
  return "modified";
}

function buildPlainSummary(files: SessionFile[]): string | null {
  if (files.length === 0) return null;
  const groups = new Map<string, Map<string, number>>();
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    const filename = parts[parts.length - 1] ?? "";
    const dotIdx = filename.lastIndexOf(".");
    const ext = dotIdx >= 0 ? filename.slice(dotIdx + 1) : "";
    const action = actionLabel(f.kind);
    if (!groups.has(action)) groups.set(action, new Map());
    groups.get(action)!.set(ext, (groups.get(action)!.get(ext) ?? 0) + 1);
    if (parts.length > 1) dirs.add(parts.slice(0, -1).slice(-2).join("/"));
  }
  const descParts: string[] = [];
  for (const [action, extMap] of groups) {
    const segs: string[] = [];
    for (const [ext, count] of extMap) {
      segs.push(`${count} ${EXT_LABELS[ext] ?? (ext || "unknown")} file${count !== 1 ? "s" : ""}`);
    }
    descParts.push(`${action.charAt(0).toUpperCase() + action.slice(1)} ${segs.join(", ")}`);
  }
  const dirArr = Array.from(dirs);
  let scope = "";
  if (dirArr.length > 0) {
    scope = `Changes in ${dirArr.slice(0, 2).join(" and ")}`;
    if (dirArr.length > 2) scope += ` and ${dirArr.length - 2} more`;
  }
  return [descParts.join(". "), scope].filter(Boolean).join(". ") + ".";
}

interface Props { session: SessionGroup; }

export default function SessionDetail({ session }: Props) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const visibleFiles = session.files.filter(
    (f) => !BUILD_ARTIFACT_PATTERNS.some((p) => f.path.includes(p)),
  );
  const plainSummary = buildPlainSummary(visibleFiles);

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#1C1C1E", padding: "12px 14px 16px 14px" }}>
      {/* Plain-English summary — only show if different from description */}
      {plainSummary && plainSummary !== session.description && (
        <div className="selectable" style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8, lineHeight: "17px" }}>
          {plainSummary}
        </div>
      )}

      {/* Confidence + Cost */}
      <div className="flex items-baseline gap-4" style={{ marginBottom: 10 }}>
        {session.confidence > 0 && (
          <span style={{ fontSize: 12, color: "#6B7280" }}>
            Confidence: {session.confidence}/100 {"\u2014"} {confidenceExplanation(session.confidence)}
          </span>
        )}
        <span style={{ fontSize: 12, color: "#6B7280" }}>
          Cost: {session.costUsd > 0 ? formatCost(session.costUsd) : "\u2014"}
        </span>
      </div>

      {/* File list */}
      {visibleFiles.length > 0 && (
        <div>
          {visibleFiles.map((file, i) => (
            <div key={file.path}>
              {i > 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />}
              <div
                className="flex items-center justify-between cursor-pointer hover:opacity-80"
                style={{ padding: "6px 0" }}
                onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
              >
                <span className="font-mono truncate selectable" style={{ fontSize: 12, color: "#9CA3AF" }}>
                  {truncatePath(file.path)}
                </span>
                <span className="flex items-center gap-3 flex-shrink-0 ml-3 font-mono" style={{ fontSize: 12 }}>
                  {file.added > 0 && <span style={{ color: "#4ade80" }}>+{file.added}</span>}
                  {file.removed > 0 && <span style={{ color: "#f87171" }}>-{file.removed}</span>}
                </span>
              </div>
              {expandedFile === file.path && (
                <div className="selectable"><DiffViewer diff={file.diff} /></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import DiffViewer from "./DiffViewer";
import { formatCost } from "../types";
import type { SessionGroup } from "../types";

const SKIP_PATTERNS = ["/target/", "/build/", "/node_modules/", "/dist/", "/.next/"];

function isFile(path: string): boolean {
  const last = path.split("/").pop() ?? "";
  return last.includes(".");
}

function shortPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return parts.slice(-2).join("/");
}

function confidenceText(score: number): { label: string; color: string; explanation: string } {
  if (score >= 80) return { label: "High", color: "#15803D", explanation: "Clean session -- good patterns, limited scope" };
  if (score >= 60) return { label: "Moderate", color: "#D97706", explanation: "Worth reviewing -- broader changes detected" };
  if (score >= 40) return { label: "Low", color: "#f97316", explanation: "Multiple concerns -- review carefully" };
  return { label: "Very Low", color: "#B91C1C", explanation: "Significant concerns -- needs thorough review" };
}

function buildSummary(session: SessionGroup): string {
  const files = session.files.filter((f) => isFile(f.path) && !SKIP_PATTERNS.some((p) => f.path.includes(p)));
  if (files.length === 0) return "No source files changed in this session.";

  const created = files.filter((f) => f.kind === "file_create");
  const modified = files.filter((f) => f.kind !== "file_create" && f.kind !== "file_delete");
  const deleted = files.filter((f) => f.kind === "file_delete");

  const totalAdded = files.reduce((s, f) => s + f.added, 0);
  const totalRemoved = files.reduce((s, f) => s + f.removed, 0);

  const parts: string[] = [];

  if (created.length > 0) {
    const names = created.slice(0, 2).map((f) => f.path.split("/").pop());
    parts.push(`Created ${names.join(", ")}${created.length > 2 ? ` and ${created.length - 2} more` : ""}`);
  }
  if (modified.length > 0) {
    const names = modified.slice(0, 2).map((f) => f.path.split("/").pop());
    parts.push(`Updated ${names.join(", ")}${modified.length > 2 ? ` and ${modified.length - 2} more` : ""}`);
  }
  if (deleted.length > 0) {
    parts.push(`Removed ${deleted.length} file${deleted.length !== 1 ? "s" : ""}`);
  }

  let summary = parts.join(". ");
  if (totalAdded > 0 || totalRemoved > 0) {
    const changes: string[] = [];
    if (totalAdded > 0) changes.push(`+${totalAdded} lines`);
    if (totalRemoved > 0) changes.push(`-${totalRemoved} lines`);
    summary += ` (${changes.join(", ")})`;
  }
  return summary + ".";
}

interface Props { session: SessionGroup; }

export default function SessionDetail({ session }: Props) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const visibleFiles = session.files.filter(
    (f) => isFile(f.path) && !SKIP_PATTERNS.some((p) => f.path.includes(p)),
  );

  const summary = buildSummary(session);
  const conf = session.confidence > 0 ? confidenceText(session.confidence) : null;

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#1C1C1E", padding: "14px 16px 16px 16px" }}>

      {/* Plain English summary */}
      <p className="selectable" style={{ fontSize: 13, color: "#D1D5DB", lineHeight: "20px", marginBottom: 12 }}>
        {summary}
      </p>

      {/* Confidence + Cost row */}
      <div className="flex items-center gap-4" style={{ marginBottom: 14 }}>
        {conf && (
          <div className="flex items-center gap-2">
            <span style={{
              fontSize: 11, fontWeight: 500, color: conf.color,
              background: conf.color + "18", padding: "2px 8px", borderRadius: 4,
            }}>
              {conf.label} ({session.confidence})
            </span>
            <span style={{ fontSize: 11, color: "#6B7280" }}>{conf.explanation}</span>
          </div>
        )}
        {!conf && <span style={{ fontSize: 11, color: "#6B7280" }}>No confidence data</span>}
        <span style={{ fontSize: 11, color: "#4B5563" }}>|</span>
        <span style={{ fontSize: 11, color: "#6B7280" }}>
          {session.costUsd > 0 ? formatCost(session.costUsd) : "No cost data"}
        </span>
      </div>

      {/* Files changed header */}
      {visibleFiles.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Files changed ({visibleFiles.length})
          </span>
        </div>
      )}

      {/* File list */}
      {visibleFiles.length > 0 && (
        <div style={{ background: "#2C2C2E", borderRadius: 6, overflow: "hidden" }}>
          {visibleFiles.map((file, i) => (
            <div key={file.path}>
              {i > 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />}
              <div
                className="flex items-center justify-between cursor-pointer"
                style={{ padding: "8px 12px" }}
                onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span className="font-mono truncate selectable" style={{ fontSize: 12, color: "#9CA3AF" }}>
                  {shortPath(file.path)}
                </span>
                <span className="flex items-center gap-3 flex-shrink-0 ml-3 font-mono" style={{ fontSize: 12 }}>
                  {file.added > 0 && <span style={{ color: "#4ade80" }}>+{file.added}</span>}
                  {file.removed > 0 && <span style={{ color: "#f87171" }}>-{file.removed}</span>}
                  <span style={{ color: "#4B5563", fontSize: 10 }}>{expandedFile === file.path ? "▾" : "▸"}</span>
                </span>
              </div>
              {expandedFile === file.path && (
                <div className="selectable" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <DiffViewer diff={file.diff} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {visibleFiles.length === 0 && (
        <p style={{ fontSize: 12, color: "#6B7280" }}>No source files in this session.</p>
      )}
    </div>
  );
}

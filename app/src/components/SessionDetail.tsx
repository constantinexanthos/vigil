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
  if (score >= 80) return { label: "High", color: "#15803D", explanation: "Clean session with limited, focused changes" };
  if (score >= 60) return { label: "Moderate", color: "#D97706", explanation: "Broader changes -- worth a quick review" };
  if (score >= 40) return { label: "Low", color: "#f97316", explanation: "Large scope of changes -- review carefully" };
  return { label: "Needs review", color: "#B91C1C", explanation: "Significant changes across many files" };
}

interface Props { session: SessionGroup; }

export default function SessionDetail({ session }: Props) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const visibleFiles = session.files.filter(
    (f) => isFile(f.path) && !SKIP_PATTERNS.some((p) => f.path.includes(p)),
  );

  const totalAdded = visibleFiles.reduce((s, f) => s + f.added, 0);
  const totalRemoved = visibleFiles.reduce((s, f) => s + f.removed, 0);
  const conf = confidenceText(session.confidence);

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#1C1C1E", padding: "14px 16px 16px 16px" }}>

      {/* Confidence + Cost + Stats row */}
      <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 14 }}>
        <span style={{
          fontSize: 11, fontWeight: 500, color: conf.color,
          background: conf.color + "18", padding: "2px 8px", borderRadius: 4,
        }}>
          Confidence {session.confidence}/100
        </span>
        <span style={{ fontSize: 11, color: "#6B7280" }}>{conf.explanation}</span>
        <span style={{ fontSize: 11, color: "#3A3A3C" }}>|</span>
        <span style={{ fontSize: 11, color: "#6B7280" }}>
          {session.costUsd > 0 ? `Cost: ${formatCost(session.costUsd)}` : "Cost tracking not available for this agent"}
        </span>
      </div>

      {/* Change summary */}
      {(totalAdded > 0 || totalRemoved > 0) && (
        <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 12 }}>
          {totalAdded > 0 && <span style={{ color: "#4ade80" }}>+{totalAdded}</span>}
          {totalAdded > 0 && totalRemoved > 0 && " "}
          {totalRemoved > 0 && <span style={{ color: "#f87171" }}>-{totalRemoved}</span>}
          <span> lines across {visibleFiles.length} file{visibleFiles.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Files changed header */}
      {visibleFiles.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Files changed
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
    </div>
  );
}

import { useState } from "react";
import DiffViewer from "./DiffViewer";
import { formatCost, truncatePath } from "../types";
import type { SessionGroup } from "../types";

const BUILD_ARTIFACT_PATTERNS = ["/target/", "/build/", "/node_modules/", "/dist/", "/.next/"];

function confidenceExplanation(score: number): string {
  if (score >= 80) return "Clean session with good patterns";
  if (score >= 60) return "Some patterns worth reviewing";
  if (score >= 40) return "Multiple concerns detected";
  return "Careful review recommended";
}

interface Props { session: SessionGroup; }

export default function SessionDetail({ session }: Props) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const visibleFiles = session.files.filter(
    (f) => !BUILD_ARTIFACT_PATTERNS.some((p) => f.path.includes(p)),
  );

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#1C1C1E", padding: "12px 14px 16px 14px" }}>
      {/* Confidence + Cost */}
      <div className="flex items-baseline gap-4" style={{ marginBottom: 10 }}>
        {session.confidence > 0 && (
          <span style={{ fontSize: 12, color: "#6B7280" }}>
            Confidence {session.confidence}/100 — {confidenceExplanation(session.confidence)}
          </span>
        )}
        {session.costUsd > 0 ? (
          <span style={{ fontSize: 12, color: "#6B7280" }}>Cost: {formatCost(session.costUsd)}</span>
        ) : (
          <span style={{ fontSize: 12, color: "#6B7280" }}>Cost: —</span>
        )}
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

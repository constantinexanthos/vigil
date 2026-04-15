import { useState } from "react";
import DiffViewer from "./DiffViewer";
import { formatCost, truncatePath } from "../types";
import type { SessionGroup } from "../types";

interface SessionDetailProps {
  session: SessionGroup;
}

const BUILD_ARTIFACT_PATTERNS = ["/target/", "/build/", "/node_modules/", "/dist/", "/.next/"];

function confidenceExplanation(score: number): string {
  if (score >= 80) return "High confidence \u2014 clean session with good patterns";
  if (score >= 60) return "Moderate confidence \u2014 some patterns worth reviewing";
  if (score >= 40) return "Low confidence \u2014 multiple concerns detected";
  return "Very low confidence \u2014 careful review recommended";
}

export default function SessionDetail({ session }: SessionDetailProps) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const visibleFiles = session.files.filter(
    (f) => !BUILD_ARTIFACT_PATTERNS.some((p) => f.path.includes(p)),
  );

  return (
    <div className="bg-surface border-t border-border pl-7 pr-4 pb-4 pt-3">
      {/* Confidence + Cost row */}
      <div className="flex items-baseline gap-4 mb-3">
        {session.confidence > 0 && (
          <div>
            <span className="text-[12px] text-text-muted">
              Confidence: {session.confidence}/100 {"\u2014"} {confidenceExplanation(session.confidence)}
            </span>
          </div>
        )}
        <span className="text-[12px] text-text-muted">
          Cost: {session.costUsd > 0 ? formatCost(session.costUsd) : "\u2014"}
        </span>
      </div>

      {/* File list table */}
      {visibleFiles.length > 0 && (
        <div>
          {visibleFiles.map((file) => (
            <div key={file.path}>
              <div
                className="flex items-center justify-between py-1.5 cursor-pointer hover:opacity-80"
                onClick={() =>
                  setExpandedFile(expandedFile === file.path ? null : file.path)
                }
              >
                <span className="font-mono text-[13px] text-text-subtle truncate">
                  {truncatePath(file.path)}
                </span>
                <span className="flex items-center gap-3 flex-shrink-0 ml-3 font-mono text-[12px]">
                  {file.added > 0 && (
                    <span style={{ color: "#4ade80" }}>+{file.added}</span>
                  )}
                  {file.removed > 0 && (
                    <span style={{ color: "#ef4444" }}>-{file.removed}</span>
                  )}
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

import { useState } from "react";
import DiffViewer from "./DiffViewer";
import { formatCost } from "../types";
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
    <div className="session-expand session-expand-active pl-7 pr-4 pb-4">
      {/* Full description */}
      <p className="text-[14px] text-text-primary mb-3">{session.description}</p>

      {/* Confidence breakdown */}
      {session.confidence > 0 && (
        <div className="mb-3">
          <p className="text-[12px] text-text-muted mb-0.5">
            Confidence: {session.confidence}/100
            {session.confidence < 50 && (
              <span className="ml-2 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-danger inline-block" />
                Low confidence
              </span>
            )}
            {session.confidence >= 50 && session.confidence < 75 && (
              <span className="ml-2 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-warning inline-block" />
                Moderate confidence
              </span>
            )}
          </p>
          <p className="text-[11px] text-text-muted">{confidenceExplanation(session.confidence)}</p>
          {session.hasWarning && (
            <p className="text-[11px] text-text-muted mt-0.5">{"\u2022"} Potential issues detected in this session</p>
          )}
        </div>
      )}

      {/* Cost breakdown */}
      {session.costUsd > 0 && (
        <p className="text-[12px] text-text-muted mb-3">
          Cost: {formatCost(session.costUsd)}
        </p>
      )}

      {/* File list */}
      {visibleFiles.length > 0 && (
        <div className="mt-2">
          {visibleFiles.map((file) => (
            <div key={file.path}>
              <div
                className="flex items-center justify-between py-1.5 cursor-pointer hover:opacity-80"
                onClick={() =>
                  setExpandedFile(expandedFile === file.path ? null : file.path)
                }
              >
                <span className="font-mono text-[13px] text-text-subtle truncate">
                  {file.path}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0 ml-3 font-mono text-[12px]">
                  {file.added > 0 && (
                    <span style={{ color: "#4ade80" }}>+{file.added}</span>
                  )}
                  {file.removed > 0 && (
                    <span style={{ color: "#ef4444" }}>-{file.removed}</span>
                  )}
                </span>
              </div>
              {expandedFile === file.path && (
                file.diff ? (
                  <DiffViewer diff={file.diff} />
                ) : (
                  <p className="text-[12px] text-text-muted font-mono ml-2 my-2">Diff not available</p>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

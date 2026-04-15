import { useState } from "react";
import DiffViewer from "./DiffViewer";
import { formatCost } from "../types";
import type { SessionGroup } from "../types";

interface SessionDetailProps {
  session: SessionGroup;
}

export default function SessionDetail({ session }: SessionDetailProps) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  return (
    <div className="session-expand session-expand-active pl-7 pr-4 pb-4">
      {/* Full description */}
      <p className="text-[14px] text-text-primary mb-3">{session.description}</p>

      {/* Confidence breakdown */}
      {session.confidence > 0 && (
        <p className="text-[12px] text-text-muted mb-1">
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
      )}

      {/* Cost breakdown */}
      {session.costUsd > 0 && (
        <p className="text-[12px] text-text-muted mb-3">
          Cost: {formatCost(session.costUsd)}
        </p>
      )}

      {/* Warnings */}
      {session.hasWarning && (
        <p className="text-[12px] text-text-muted mb-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-warning inline-block" />
          Session has warnings
        </p>
      )}

      {/* File list */}
      {session.files.length > 0 && (
        <div className="mt-2">
          {session.files.map((file) => (
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
              {expandedFile === file.path && file.diff && (
                <DiffViewer diff={file.diff} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

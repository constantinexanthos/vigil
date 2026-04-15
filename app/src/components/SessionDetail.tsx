import { useState } from "react";
import DiffViewer from "./DiffViewer";
import { formatCost, truncatePath } from "../types";
import type { SessionGroup, SessionFile } from "../types";

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

const EXT_LABELS: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  rs: "Rust",
  py: "Python",
  css: "CSS",
  html: "HTML",
  json: "JSON",
  md: "Markdown",
  toml: "TOML",
  yaml: "YAML",
  yml: "YAML",
  sql: "SQL",
  sh: "shell",
  go: "Go",
  java: "Java",
  rb: "Ruby",
  swift: "Swift",
};

function actionLabel(kind: string): string {
  if (kind === "file_create") return "created";
  if (kind === "file_delete") return "deleted";
  return "modified";
}

function buildPlainSummary(files: SessionFile[]): string | null {
  if (files.length === 0) return null;

  // Group by action + extension
  const groups = new Map<string, Map<string, number>>(); // action -> ext -> count
  const dirs = new Set<string>();

  for (const f of files) {
    const parts = f.path.split("/");
    const filename = parts[parts.length - 1] ?? "";
    const dotIdx = filename.lastIndexOf(".");
    const ext = dotIdx >= 0 ? filename.slice(dotIdx + 1) : "";

    const action = actionLabel(f.kind);
    if (!groups.has(action)) groups.set(action, new Map());
    const extMap = groups.get(action)!;
    extMap.set(ext, (extMap.get(ext) ?? 0) + 1);

    // Collect directories (last 2 segments of directory path)
    if (parts.length > 1) {
      const dirParts = parts.slice(0, -1);
      const short = dirParts.slice(-2).join("/");
      dirs.add(short);
    }
  }

  // Build file description parts
  const descParts: string[] = [];
  for (const [action, extMap] of groups) {
    const segments: string[] = [];
    for (const [ext, count] of extMap) {
      const label = EXT_LABELS[ext] ?? (ext || "unknown");
      const isTest = files.some(
        (f) =>
          f.kind === (action === "created" ? "file_create" : action === "deleted" ? "file_delete" : f.kind) &&
          (f.path.includes(".test.") || f.path.includes(".spec.") || f.path.includes("/test") || f.path.includes("/tests")),
      );
      if (isTest && ext && (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx")) {
        // Check which of these files are test files
        const testCount = files.filter(
          (f) =>
            (f.path.includes(".test.") || f.path.includes(".spec.") || f.path.includes("/__tests__/")) &&
            f.path.endsWith(`.${ext}`),
        ).length;
        const nonTestCount = count - testCount;
        if (nonTestCount > 0) {
          segments.push(`${nonTestCount} ${label} file${nonTestCount !== 1 ? "s" : ""}`);
        }
        if (testCount > 0) {
          segments.push(`${testCount} test file${testCount !== 1 ? "s" : ""}`);
        }
      } else {
        segments.push(`${count} ${label} file${count !== 1 ? "s" : ""}`);
      }
    }
    const actionCap = action.charAt(0).toUpperCase() + action.slice(1);
    descParts.push(`${actionCap} ${segments.join(", ")}`);
  }

  // Build scope description (top 2 directories)
  const dirArr = Array.from(dirs);
  let scopePart = "";
  if (dirArr.length > 0) {
    const shown = dirArr.slice(0, 2);
    scopePart = `Changes in ${shown.join(" and ")}`;
    if (dirArr.length > 2) {
      scopePart += ` and ${dirArr.length - 2} more`;
    }
  }

  const parts: string[] = [];
  if (descParts.length > 0) parts.push(descParts.join(". "));
  if (scopePart) parts.push(scopePart);
  return parts.join(". ") + ".";
}

export default function SessionDetail({ session }: SessionDetailProps) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const visibleFiles = session.files.filter(
    (f) => !BUILD_ARTIFACT_PATTERNS.some((p) => f.path.includes(p)),
  );

  const plainSummary = buildPlainSummary(visibleFiles);

  return (
    <div className="bg-surface border-t border-border pl-7 pr-4 pb-4 pt-3">
      {/* Description (from commit message) */}
      {session.description && (
        <div style={{ fontSize: "13px", color: "#d4d4d8", marginBottom: "6px" }}>
          {session.description}
        </div>
      )}

      {/* Plain-English summary */}
      {plainSummary && (
        <div
          style={{
            fontSize: "13px",
            color: "#a1a1aa",
            fontFamily: "Inter, system-ui, sans-serif",
            marginBottom: "10px",
            lineHeight: "18px",
          }}
        >
          {plainSummary}
        </div>
      )}

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

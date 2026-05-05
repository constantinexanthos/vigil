interface DiffViewerProps {
  diff: string | null;
}

type LineKind = "add" | "remove" | "hunk" | "context" | "header";

function classifyLine(line: string): LineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "header";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

interface ParsedLine {
  content: string;
  kind: LineKind;
  lineNo: number | null;
}

function parseUnifiedDiff(raw: string): ParsedLine[] {
  const lines = raw.split("\n");
  const parsed: ParsedLine[] = [];
  let currentLine = 0;

  for (const line of lines) {
    const kind = classifyLine(line);

    if (kind === "hunk") {
      // Extract starting line number from @@ -a,b +c,d @@
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      currentLine = match ? parseInt(match[1], 10) : currentLine;
      parsed.push({ content: line, kind, lineNo: null });
    } else if (kind === "header") {
      parsed.push({ content: line, kind, lineNo: null });
    } else if (kind === "remove") {
      parsed.push({ content: line, kind, lineNo: null });
    } else if (kind === "add") {
      parsed.push({ content: line, kind, lineNo: currentLine });
      currentLine++;
    } else {
      parsed.push({ content: line, kind, lineNo: currentLine });
      currentLine++;
    }
  }

  return parsed;
}

const STYLES: Record<LineKind, { color: string; bg: string; borderLeft: string }> = {
  add: {
    color: "#4ade80",
    bg: "rgba(74, 222, 128, 0.08)",
    borderLeft: "2px solid #4ade80",
  },
  remove: {
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.08)",
    borderLeft: "2px solid #ef4444",
  },
  hunk: {
    color: "#71717a",
    bg: "rgba(59, 130, 246, 0.08)",
    borderLeft: "2px solid transparent",
  },
  context: {
    color: "#a1a1aa",
    bg: "transparent",
    borderLeft: "2px solid transparent",
  },
  header: {
    color: "#52525b",
    bg: "transparent",
    borderLeft: "2px solid transparent",
  },
};

export default function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff || diff.trim() === "" || diff === "(no changes)") {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-text-muted">
        Diff not available
      </div>
    );
  }

  const parsed = parseUnifiedDiff(diff);

  return (
    <div
      className="max-h-[400px] overflow-y-auto overflow-x-auto my-2"
      style={{ borderRadius: "6px", border: "1px solid #1e1e21" }}
    >
      <pre
        className="font-mono"
        style={{ fontSize: "12px", lineHeight: "20px", margin: 0 }}
      >
        {parsed.map((line, i) => {
          const style = STYLES[line.kind];
          return (
            <div
              key={i}
              className="flex"
              style={{
                background: style.bg,
                borderLeft: style.borderLeft,
              }}
            >
              {/* Line number gutter */}
              <span
                className="select-none text-right flex-shrink-0 px-2"
                style={{
                  width: "40px",
                  color: "#52525b",
                  borderRight: "1px solid #1e1e21",
                }}
              >
                {line.lineNo ?? ""}
              </span>
              {/* Code content */}
              <span className="pl-3 pr-4" style={{ color: style.color }}>
                {line.content || " "}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

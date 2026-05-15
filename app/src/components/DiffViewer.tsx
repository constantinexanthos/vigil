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

// DiffViewer is the only surface in the app that genuinely needs two
// distinct accent colors — additions and deletions must be perceptually
// separable. Reuses the existing `ok` (green, #4ade80) and `bad` (red,
// #ef4444) tokens from the v2a palette — these double as the diff hues and
// the live-status / conflict accents elsewhere, so the total app-wide
// color count stays at 8 (6 vigil-* + ok + bad).
//
// Context and hunk lines are now vigil-mute — no third hue. Background tint
// stays on add/remove lines so the eye can scan blocks at a distance.
export default function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff || diff.trim() === "" || diff === "(no changes)") {
    return (
      <div className="flex items-center justify-center py-6 text-[12px] text-vigil-mute">
        Diff not available
      </div>
    );
  }

  const parsed = parseUnifiedDiff(diff);

  return (
    <div className="max-h-[400px] overflow-y-auto overflow-x-auto my-2 rounded border border-vigil-rule">
      <pre
        className="font-mono text-[12px] leading-5"
        style={{ margin: 0 }}
      >
        {parsed.map((line, i) => {
          const cls = lineClass(line.kind);
          return (
            <div key={i} className={`flex ${cls}`}>
              <span className="select-none text-right shrink-0 px-2 w-[40px] text-vigil-mute border-r border-vigil-rule">
                {line.lineNo ?? ""}
              </span>
              <span className="pl-3 pr-4">
                {line.content || " "}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function lineClass(kind: LineKind): string {
  switch (kind) {
    case "add":
      return "text-ok bg-ok/[0.08] border-l-2 border-ok";
    case "remove":
      return "text-bad bg-bad/[0.08] border-l-2 border-bad";
    case "hunk":
      return "text-vigil-mute border-l-2 border-transparent";
    case "header":
      return "text-vigil-mute/60 border-l-2 border-transparent";
    case "context":
    default:
      return "text-vigil-ink border-l-2 border-transparent";
  }
}

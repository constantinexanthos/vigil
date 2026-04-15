interface DiffViewerProps {
  diff: string;
}

function classifyLine(line: string): "add" | "remove" | "hunk" | "context" {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "add";
  if (line.startsWith("-") && !line.startsWith("---")) return "remove";
  return "context";
}

export default function DiffViewer({ diff }: DiffViewerProps) {
  const lines = diff.split("\n");

  return (
    <div className="max-h-[400px] overflow-y-auto overflow-x-auto mt-2 rounded">
      <pre className="font-mono text-[12px] leading-[1.6]">
        {lines.map((line, i) => {
          const kind = classifyLine(line);
          let textColor = "#71717a";
          let bgColor = "transparent";

          if (kind === "add") {
            textColor = "#4ade80";
            bgColor = "rgba(74,222,128,0.1)";
          } else if (kind === "remove") {
            textColor = "#ef4444";
            bgColor = "rgba(239,68,68,0.1)";
          } else if (kind === "hunk") {
            textColor = "#52525b";
          }

          return (
            <div
              key={i}
              className="flex"
              style={{ background: bgColor }}
            >
              <span
                className="select-none w-10 text-right pr-3 flex-shrink-0"
                style={{ color: "#52525b" }}
              >
                {i + 1}
              </span>
              <span style={{ color: textColor }}>{line}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

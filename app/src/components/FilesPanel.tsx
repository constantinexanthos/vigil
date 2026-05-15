import { useState } from "react";
import DiffViewer from "./DiffViewer";
import type { SessionFile } from "../types";

interface Props {
  files: SessionFile[];
}

// FilesPanel is the files list under the Files tab. Same row pattern as
// IdentitiesPane in the proxy tab — single 24px line with hover-tint and
// border-l accent on the open file. The +/- counts collapse to a single
// monochrome tabular cluster rather than the old green/red pair; readers
// who care about the direction see the leading kindLetter.
export function FilesPanel({ files }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const selected = files.find((f) => f.path === open) ?? null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto font-mono" data-testid="files-list">
        {files.length === 0 && (
          <div className="px-4 py-2 text-[12px] text-vigil-mute font-sans">
            No files touched yet.
          </div>
        )}
        {files.map((f) => {
          const isOpen = open === f.path;
          return (
            <button
              key={f.path}
              type="button"
              onClick={() => setOpen(isOpen ? null : f.path)}
              className={`w-full grid grid-cols-[1fr_auto] gap-2 items-center px-4 h-6 text-[11.5px] text-left transition-colors duration-fast border-l-2 ${
                isOpen
                  ? "bg-vigil-surface border-vigil-accent text-vigil-ink"
                  : "border-transparent hover:bg-vigil-surface text-vigil-ink"
              }`}
            >
              <span className="truncate">{f.path}</span>
              <span className="text-vigil-mute shrink-0 tabular-nums">
                {kindLetter(f.kind)} +{f.added} −{f.removed}
              </span>
            </button>
          );
        })}
      </div>
      {selected?.diff && (
        <div className="border-t border-vigil-rule max-h-[45%] overflow-auto">
          <div className="px-4 h-6 flex items-center text-[10px] uppercase tracking-[0.10em] text-vigil-mute font-mono">
            {selected.path}
          </div>
          <DiffViewer diff={selected.diff} />
        </div>
      )}
    </div>
  );
}

function kindLetter(k: string): string {
  if (k === "file_create") return "N";
  if (k === "file_delete") return "D";
  return "U";
}

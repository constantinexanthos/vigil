import { useState } from "react";
import DiffViewer from "./DiffViewer";
import type { SessionFile } from "../types";

interface Props {
  files: SessionFile[];
}

export function FilesPanel({ files }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const selected = files.find((f) => f.path === open) ?? null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {files.length === 0 && (
          <div className="px-4 py-5 text-white/45">No files touched yet.</div>
        )}
        {files.map((f) => {
          const isOpen = open === f.path;
          return (
            <button
              key={f.path}
              type="button"
              onClick={() => setOpen(isOpen ? null : f.path)}
              className={`w-full flex items-center justify-between px-4 py-1.5 text-left hover:bg-white/4 transition-colors duration-fast ${isOpen ? "bg-white/5 text-white" : "text-white/75"}`}
            >
              <span className="truncate">{f.path}</span>
              <span className="text-white/35 shrink-0 ml-2">
                {kindLetter(f.kind)} <span className="text-emerald-400">+{f.added}</span> <span className="text-rose-400">-{f.removed}</span>
              </span>
            </button>
          );
        })}
      </div>
      {selected?.diff && (
        <div className="border-t border-white/5 max-h-[45%] overflow-auto">
          <div className="px-4 py-2 text-xs text-white/55 font-mono">{selected.path}</div>
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

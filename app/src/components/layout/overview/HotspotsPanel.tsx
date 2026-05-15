import { useMemo } from "react";
import { displayPath } from "../../../lib/path";
import type { FileHeat, Collision } from "../../../types";

interface Props {
  files: FileHeat[];
  collisions: Collision[];
  repoPath: string | null;
}

// HotspotsPanel = "Most edited (last hour)". Was a table with per-agent
// color dots + progress bar; the polish pass strips agent color (multi-hue
// dots violate the restraint budget) and replaces the progress bar with a
// right-aligned tabular count. Conflict files keep the bad-accent left
// border so they stay scannable. Path is the row's primary content, in
// mono — Linear's file-rows pattern.
export function HotspotsPanel({ files, collisions, repoPath }: Props) {
  const collisionPaths = useMemo(
    () => new Set(collisions.map((c) => c.file_path)),
    [collisions],
  );

  if (files.length === 0) {
    return (
      <div className="px-4 py-2 text-[12px] text-vigil-mute">
        Quiet — no file activity in the last hour.
      </div>
    );
  }

  return (
    <div>
      {files.map((f) => {
        const isCollision = collisionPaths.has(f.path);
        return (
          <div
            key={f.path}
            className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 h-6 border-l-2 transition-colors duration-fast hover:bg-vigil-surface ${
              isCollision ? "border-bad" : "border-transparent"
            }`}
          >
            <span
              dir="rtl"
              className="block truncate text-[11.5px] font-mono text-vigil-ink"
              title={f.path}
            >
              <bdi>{displayPath(f.path, repoPath)}</bdi>
            </span>
            <span className="text-[10px] text-vigil-mute tabular-nums">
              {f.agents.length} {f.agents.length === 1 ? "agent" : "agents"}
            </span>
            <span className="text-[11px] text-vigil-ink tabular-nums w-12 text-right">
              {f.edit_count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

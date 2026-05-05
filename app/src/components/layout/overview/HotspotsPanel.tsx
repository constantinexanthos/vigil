import { useMemo } from "react";
import { agentColor } from "../../../types";
import { displayPath } from "../../../lib/path";
import type { FileHeat, Collision } from "../../../types";

interface Props {
  files: FileHeat[];
  collisions: Collision[];
  repoPath: string | null;
}

export function HotspotsPanel({ files, collisions, repoPath }: Props) {
  const collisionPaths = useMemo(
    () => new Set(collisions.map((c) => c.file_path)),
    [collisions],
  );

  if (files.length === 0) {
    return (
      <div className="px-5 py-3">
        <p className="text-[12px] text-white/45">Quiet — no file activity in the last hour.</p>
      </div>
    );
  }

  const maxCount = files[0]?.edit_count ?? 1;

  return (
    <div className="px-5 py-3">
      <table className="w-full">
        <thead className="sr-only">
          <tr><th>File</th><th>Edit count</th><th>Agents</th></tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const widthPct = Math.round((f.edit_count / maxCount) * 100);
            const isCollision = collisionPaths.has(f.path);
            const visibleAgents = f.agents.slice(0, 3);
            const overflow = f.agents.length - visibleAgents.length;
            return (
              <tr key={f.path} className="border-t border-white/5">
                <td className="py-1.5 pr-3 text-[11.5px] text-white/85 font-mono overflow-hidden">
                  <span dir="rtl" className="block truncate">
                    <bdi>{displayPath(f.path, repoPath)}</bdi>
                  </span>
                </td>
                <td className="py-1.5 pr-3 w-[80px]">
                  <div
                    role="progressbar"
                    aria-valuenow={f.edit_count}
                    aria-valuemin={0}
                    aria-valuemax={maxCount}
                    className="h-[4px] bg-white/10 rounded-sm overflow-hidden"
                  >
                    <div
                      className="h-full bg-info"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </td>
                <td className="py-1.5 w-[80px] text-right">
                  <span className="inline-flex items-center gap-1">
                    {isCollision && <span className="text-warn text-[9px]">▲</span>}
                    {visibleAgents.map((a) => (
                      <span
                        key={a}
                        className="inline-block w-[6px] h-[6px] rounded-full"
                        style={{ backgroundColor: agentColor(a) }}
                        title={a}
                      />
                    ))}
                    {overflow > 0 && (
                      <span className="text-[9px] text-white/45">+{overflow}</span>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import type { SessionFile } from "../types";

interface Props {
  files: SessionFile[];
  repoPath?: string | null;
}

export function AllFilesPanel({ files, repoPath }: Props) {
  if (files.length === 0) {
    return (
      <div className="px-4 py-5 text-[12px] text-white/45">
        No files touched yet.
      </div>
    );
  }

  const sorted = [...files].sort((a, b) => totalChanged(b) - totalChanged(a));

  return (
    <ul className="flex-1 overflow-y-auto px-4 py-3 space-y-1 list-none pl-0" role="list">
      {sorted.map((f) => (
        <li
          key={f.path}
          className="flex items-center gap-2 font-mono text-[11px] text-white/80 py-0.5"
          role="listitem"
          title={f.path}
        >
          <span className="flex-1 truncate" dir="rtl">
            <bdi>{displayPath(f.path, repoPath)}</bdi>
          </span>
          <span className="shrink-0 text-ok">+{f.added}</span>
          <span className="shrink-0 text-bad">-{f.removed}</span>
        </li>
      ))}
    </ul>
  );
}

function totalChanged(f: SessionFile): number {
  return (f.added || 0) + (f.removed || 0);
}

/**
 * Strip the session's repoPath prefix so users see `src/components/Foo.tsx`
 * instead of `/Users/.../conductor/repos/vigil/src/components/Foo.tsx`.
 * Falls back to a trailing-3-segments trim for paths outside the repo.
 */
function displayPath(path: string, repoPath: string | null | undefined): string {
  if (repoPath && path.startsWith(repoPath)) {
    return path.slice(repoPath.length).replace(/^\//, "");
  }
  const parts = path.split("/").filter(Boolean);
  return parts.length > 3 ? parts.slice(-3).join("/") : path;
}

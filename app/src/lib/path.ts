/** Strip repoPath prefix → repo-relative path; fallback to last 3 segments. */
export function displayPath(path: string, repoPath: string | null | undefined): string {
  if (!path) return path;
  if (repoPath && path.startsWith(repoPath)) {
    return path.slice(repoPath.length).replace(/^\//, "");
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return parts.slice(-3).join("/");
}

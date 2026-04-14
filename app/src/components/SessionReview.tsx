import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Prism from "prismjs";
import "prismjs/components/prism-diff";
import {
  getSessionDiffs,
  rollbackFiles,
  type SessionResponse,
  type FileDiffResponse,
} from "../tauri";

interface Props {
  session: SessionResponse;
  onBack: () => void;
}

type FileDecision = "accept" | "reject" | "pending";

export default function SessionReview({ session, onBack }: Props) {
  const [diffs, setDiffs] = useState<FileDiffResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, FileDecision>>({});
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);

  useEffect(() => {
    getSessionDiffs(session.id)
      .then((d) => {
        setDiffs(d);
        const initial: Record<string, FileDecision> = {};
        for (const f of d) {
          initial[f.file_path] = "pending";
        }
        setDecisions(initial);
      })
      .catch(() => setDiffs([]))
      .finally(() => setLoading(false));
  }, [session.id]);

  useEffect(() => {
    Prism.highlightAll();
  }, [diffs]);

  const toggleDecision = (filePath: string, decision: FileDecision) => {
    setDecisions((prev) => ({
      ...prev,
      [filePath]: prev[filePath] === decision ? "pending" : decision,
    }));
  };

  const rejectedFiles = Object.entries(decisions)
    .filter(([, d]) => d === "reject")
    .map(([f]) => f);

  const handleApply = async () => {
    if (rejectedFiles.length === 0) return;
    setApplying(true);
    try {
      const repoPath = session.repo_path ?? ".";
      const res = await rollbackFiles(rejectedFiles, repoPath);
      setResults(res);
    } catch (e) {
      setResults([`Error: ${e}`]);
    } finally {
      setApplying(false);
    }
  };

  if (results) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-4"
      >
        <h2 className="text-sm font-semibold text-cyan mb-3">Rollback Complete</h2>
        <div className="flex flex-col gap-1 mb-4">
          {results.map((r, i) => (
            <div key={i} className="text-xs text-text-muted">
              {r}
            </div>
          ))}
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded border border-border text-sm text-text-muted hover:text-text hover:border-cyan/40 transition-colors cursor-pointer"
        >
          Back to sessions
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-3 flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          &larr; back
        </button>
        <span className="text-xs text-text-muted">
          {session.agent} -- {diffs.length} files
        </span>
      </div>

      {loading ? (
        <div className="text-text-muted text-sm">Loading diffs...</div>
      ) : diffs.length === 0 ? (
        <div className="text-text-muted text-sm">No file diffs available.</div>
      ) : (
        <>
          {/* File list with diffs */}
          {diffs.map((fileDiff) => {
            const decision = decisions[fileDiff.file_path] ?? "pending";
            return (
              <motion.div
                key={fileDiff.file_path}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg border bg-surface overflow-hidden transition-colors ${
                  decision === "accept"
                    ? "border-green/50"
                    : decision === "reject"
                      ? "border-red/50"
                      : "border-border"
                }`}
              >
                {/* File header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs text-text truncate flex-1">
                    {fileDiff.file_path}
                  </span>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => toggleDecision(fileDiff.file_path, "accept")}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        decision === "accept"
                          ? "bg-green/20 text-green border border-green/40"
                          : "text-text-muted border border-border hover:border-green/30 hover:text-green"
                      }`}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => toggleDecision(fileDiff.file_path, "reject")}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        decision === "reject"
                          ? "bg-red/20 text-red border border-red/40"
                          : "text-text-muted border border-border hover:border-red/30 hover:text-red"
                      }`}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {/* Diff content */}
                <pre className="p-3 overflow-x-auto text-xs leading-relaxed max-h-48 overflow-y-auto">
                  <code className="language-diff">{fileDiff.diff}</code>
                </pre>
              </motion.div>
            );
          })}

          {/* Apply button */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-text-muted">
              {rejectedFiles.length} file{rejectedFiles.length !== 1 ? "s" : ""} to
              revert
            </span>
            <button
              onClick={handleApply}
              disabled={rejectedFiles.length === 0 || applying}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
                rejectedFiles.length === 0 || applying
                  ? "border border-border text-text-muted opacity-50 cursor-not-allowed"
                  : "bg-red/10 border border-red/40 text-red hover:bg-red/20"
              }`}
            >
              {applying ? "Applying..." : "Apply Rollback"}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

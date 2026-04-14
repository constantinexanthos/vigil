import CommitCard from "./CommitCard";
import type { CommitGroup } from "../types";

interface Props {
  commits: CommitGroup[];
}

export default function CommitTimeline({ commits }: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 pt-3 pb-2">
        <p className="text-[10px] text-text-muted uppercase tracking-widest">COMMITS</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {commits.length === 0 ? (
          <p className="text-xs text-text-secondary text-center py-8">No commits yet</p>
        ) : (
          commits.map((commit, i) => (
            <CommitCard key={`${commit.commit_hash}-${i}`} commit={commit} />
          ))
        )}
      </div>
    </div>
  );
}

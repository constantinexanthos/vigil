import { useState } from "react";
import { FilesPanel } from "../FilesPanel";
import type { SessionGroup } from "../../types";

type Tab = "all" | "changes" | "checks" | "review";

interface Props {
  session: SessionGroup | null;
}

export function RightRail({ session }: Props) {
  const [tab, setTab] = useState<Tab>("changes");
  const changeCount = session ? session.files.length : 0;

  return (
    <aside
      className="h-full flex flex-col"
      style={{
        background: "rgba(18,18,20,0.75)",
        borderLeft: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <nav className="px-4 py-3 border-b border-white/5 flex gap-4 text-[12px]">
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>All files</TabButton>
        <TabButton active={tab === "changes"} onClick={() => setTab("changes")}>
          Changes {changeCount > 0 ? changeCount : null}
        </TabButton>
        <TabButton active={tab === "checks"} onClick={() => setTab("checks")}>Checks</TabButton>
        <TabButton active={tab === "review"} onClick={() => setTab("review")}>Review</TabButton>
      </nav>
      {!session && <div className="px-4 py-5 text-[12px] text-white/45">Select a session to see its changes.</div>}
      {session && tab === "changes" && <FilesPanel files={session.files} />}
      {session && tab !== "changes" && (
        <div className="px-4 py-5 text-[12px] text-white/45">
          This tab is not wired yet. For V1 the changes tab is the canonical view.
        </div>
      )}
      <div className="border-t border-white/5 px-4 py-2.5 text-[11px] text-white/55 flex gap-3.5">
        <span>Setup</span><span>Run</span><span>Terminal</span>
        <span className="ml-auto text-white/30">+</span>
      </div>
    </aside>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pb-0.5 transition-colors ${active ? "text-white border-b border-white" : "text-white/45 hover:text-white/75"}`}
    >
      {children}
    </button>
  );
}

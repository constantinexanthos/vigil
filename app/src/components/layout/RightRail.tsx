import { useSelection, type RightTab } from "../../store/selection";
import { FilesPanel } from "../FilesPanel";
import { AllFilesPanel } from "../AllFilesPanel";
import { ReviewPanel } from "../ReviewPanel";
import { ChecksPlaceholder } from "../ChecksPlaceholder";
import type { SessionGroup, ReviewSignals } from "../../types";

type Tab = RightTab;

interface Props {
  session: SessionGroup | null;
  reviewSignals: ReviewSignals | null;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All files" },
  { id: "changes", label: "Changes" },
  { id: "checks", label: "Checks" },
  { id: "review", label: "Review" },
];

export function RightRail({ session, reviewSignals }: Props) {
  const tab = useSelection((s) => s.rightTab);
  const setTab = useSelection((s) => s.setRightTab);

  const allFilesCount = session ? session.files.length : 0;
  const changesCount = allFilesCount; // same underlying source in V2b
  const reviewSignalCount = reviewSignals?.collisions.length ?? 0;

  return (
    <aside
      className="h-full flex flex-col"
      style={{
        background: "rgba(18,18,20,0.75)",
        borderLeft: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <nav
        role="tablist"
        aria-label="Session details"
        className="px-4 py-3 border-b border-white/5 flex gap-4 text-[12px]"
      >
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            controls={`right-rail-panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "all" && allFilesCount > 0 ? <span className="ml-1 text-white/35">{allFilesCount}</span> : null}
            {t.id === "changes" && changesCount > 0 ? <span className="ml-1 text-white/35">{changesCount}</span> : null}
            {t.id === "review" && reviewSignalCount > 0 ? (
              <span className="ml-1 inline-flex items-center justify-center bg-bad text-white text-[9px] rounded-full min-w-[14px] h-[14px] px-1">
                {reviewSignalCount}
              </span>
            ) : null}
          </TabButton>
        ))}
      </nav>

      {!session && (
        <div className="px-4 py-5 text-[12px] text-white/45">
          Select a session to see its changes.
        </div>
      )}

      {session && tab === "all" && (
        <div role="tabpanel" id="right-rail-panel-all" className="flex-1 flex flex-col overflow-hidden">
          <AllFilesPanel files={session.files} />
        </div>
      )}
      {session && tab === "changes" && (
        <div role="tabpanel" id="right-rail-panel-changes" className="flex-1 flex flex-col overflow-hidden">
          <FilesPanel files={session.files} />
        </div>
      )}
      {session && tab === "checks" && (
        <div role="tabpanel" id="right-rail-panel-checks" className="flex-1 overflow-y-auto">
          <ChecksPlaceholder />
        </div>
      )}
      {session && tab === "review" && (
        <div role="tabpanel" id="right-rail-panel-review" className="flex-1 flex flex-col overflow-hidden">
          <ReviewPanel signals={reviewSignals} />
        </div>
      )}

      <div className="border-t border-white/5 px-4 py-2.5 text-[11px] text-white/55 flex gap-3.5">
        <span>Setup</span>
        <span>Run</span>
        <span>Terminal</span>
        <span className="ml-auto text-white/30" aria-hidden>
          +
        </span>
      </div>
    </aside>
  );
}

function TabButton({
  active,
  controls,
  onClick,
  children,
}: {
  active: boolean;
  controls: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`pb-0.5 transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40 ${active ? "text-white border-b border-white" : "text-white/45 hover:text-white/75 hover:underline decoration-white/30 underline-offset-4"}`}
    >
      {children}
    </button>
  );
}

import { useSelection, type RightTab } from "../../store/selection";
import { FilesPanel } from "../FilesPanel";
import { ReviewPanel } from "../ReviewPanel";
import type { SessionGroup, ReviewSignals } from "../../types";

interface Props {
  session: SessionGroup | null;
  reviewSignals: ReviewSignals | null;
}

const TABS: { id: RightTab; label: string }[] = [
  { id: "changes", label: "Files" },
  { id: "review", label: "Review" },
];

export function RightRail({ session, reviewSignals }: Props) {
  const tab = useSelection((s) => s.rightTab);
  const setTab = useSelection((s) => s.setRightTab);

  const fileCount = session ? session.files.length : 0;
  const reviewSignalCount = reviewSignals?.collisions.length ?? 0;

  return (
    <aside className="h-full flex flex-col">
      <nav
        role="tablist"
        aria-label="Session details"
        className="px-5 py-3.5 flex gap-5 text-sm"
      >
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            controls={`right-rail-panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "changes" && fileCount > 0 ? (
              <span className="ml-1.5 text-white/35 tabular-nums">{fileCount}</span>
            ) : null}
            {t.id === "review" && reviewSignalCount > 0 ? (
              <span className="ml-1.5 inline-flex items-center justify-center bg-bad text-white text-label rounded-full min-w-[14px] h-[14px] px-1 tabular-nums">
                {reviewSignalCount}
              </span>
            ) : null}
          </TabButton>
        ))}
      </nav>

      {!session && (
        <div className="px-5 py-4 text-sm text-white/45">
          Pick a session to see its files and review signals.
        </div>
      )}

      {session && tab === "changes" && (
        <div role="tabpanel" id="right-rail-panel-changes" className="flex-1 flex flex-col overflow-hidden">
          <FilesPanel files={session.files} />
        </div>
      )}
      {session && tab === "review" && (
        <div role="tabpanel" id="right-rail-panel-review" className="flex-1 flex flex-col overflow-hidden">
          <ReviewPanel signals={reviewSignals} />
        </div>
      )}
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
      className={`pb-1 transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40 ${active ? "text-white border-b border-white" : "text-white/45 hover:text-white/75"}`}
    >
      {children}
    </button>
  );
}

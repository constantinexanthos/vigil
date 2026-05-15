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

// RightRail's tab strip mirrors the TopBar pattern — monospace, underline
// on active, vigil-mute on inactive — so the two horizontal navs feel like
// the same idiom at different scales. Counts are tabular numerals; the
// review badge no longer uses a filled red pill (was rose-bad colored),
// just the count in mute with a bad-accent dot when non-zero.
export function RightRail({ session, reviewSignals }: Props) {
  const tab = useSelection((s) => s.rightTab);
  const setTab = useSelection((s) => s.setRightTab);

  const fileCount = session ? session.files.length : 0;
  const reviewSignalCount = reviewSignals?.collisions.length ?? 0;

  return (
    <aside aria-label="Session details" className="h-full flex flex-col border-l border-vigil-rule">
      <nav
        role="tablist"
        aria-label="Session details"
        className="h-9 px-3 flex items-center gap-3 border-b border-vigil-rule font-mono text-[11px]"
      >
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            controls={`right-rail-panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "changes" && fileCount > 0 && (
              <span className="ml-1.5 text-vigil-mute tabular-nums">
                {fileCount}
              </span>
            )}
            {t.id === "review" && reviewSignalCount > 0 && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-bad tabular-nums">
                <span
                  aria-hidden
                  className="w-1 h-1 rounded-full bg-bad"
                />
                {reviewSignalCount}
              </span>
            )}
          </TabButton>
        ))}
      </nav>

      {!session && (
        <div className="px-4 py-3 text-[12px] text-vigil-mute">
          Pick a session to see its files and review signals.
        </div>
      )}

      {session && tab === "changes" && (
        <div
          role="tabpanel"
          id="right-rail-panel-changes"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <FilesPanel files={session.files} />
        </div>
      )}
      {session && tab === "review" && (
        <div
          role="tabpanel"
          id="right-rail-panel-review"
          className="flex-1 flex flex-col overflow-hidden"
        >
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
      className={`pb-0.5 transition-colors duration-fast ${
        active
          ? "text-vigil-ink border-b border-vigil-accent"
          : "text-vigil-mute hover:text-vigil-ink"
      }`}
    >
      {children}
    </button>
  );
}

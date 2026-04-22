import { useSelection, type RightTab } from "../../store/selection";
import { FilesPanel } from "../FilesPanel";
import type { SessionGroup } from "../../types";

type Tab = RightTab;

interface Props {
  session: SessionGroup | null;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All files" },
  { id: "changes", label: "Changes" },
  { id: "checks", label: "Checks" },
  { id: "review", label: "Review" },
];

export function RightRail({ session }: Props) {
  const tab = useSelection((s) => s.rightTab);
  const setTab = useSelection((s) => s.setRightTab);
  const changeCount = session ? session.files.length : 0;

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
            {t.id === "changes" ? (
              <>
                {t.label}
                {changeCount > 0 ? ` ${changeCount}` : null}
              </>
            ) : (
              t.label
            )}
          </TabButton>
        ))}
      </nav>
      {!session && (
        <div className="px-4 py-5 text-[12px] text-white/45">
          Select a session to see its changes.
        </div>
      )}
      {session && tab === "changes" && (
        <div role="tabpanel" id="right-rail-panel-changes" className="flex-1 flex flex-col overflow-hidden">
          <FilesPanel files={session.files} />
        </div>
      )}
      {session && tab !== "changes" && (
        <div
          role="tabpanel"
          id={`right-rail-panel-${tab}`}
          className="px-4 py-5 text-[12px] text-white/45"
        >
          This tab is not wired yet. For V1 the changes tab is the canonical view.
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
      className={`pb-0.5 transition-colors ${active ? "text-white border-b border-white" : "text-white/45 hover:text-white/75"}`}
    >
      {children}
    </button>
  );
}

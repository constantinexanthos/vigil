import { useState } from "react";
import Sidebar from "./components/Sidebar";
import DashboardView from "./components/views/DashboardView";
import ActivityView from "./components/views/ActivityView";
import CommitsView from "./components/views/CommitsView";
import SessionsView from "./components/views/SessionsView";
import CostsView from "./components/views/CostsView";
import SettingsView from "./components/views/SettingsView";
import { useDaemonData } from "./hooks";
import { formatCost } from "./types";

type View = "dashboard" | "activity" | "commits" | "sessions" | "costs" | "settings";

export default function App() {
  const data = useDaemonData();
  const [view, setView] = useState<View>("dashboard");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  return (
    <div className="h-screen w-full bg-bg flex font-sans">
      <Sidebar
        activeView={view}
        onNavigate={(v) => setView(v as View)}
        expanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        connected={data.connected}
      />
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0">
          <h1 className="text-[15px] font-semibold text-text-primary capitalize">{view}</h1>
          <div className="flex items-center gap-4">
            {data.costSummary.total_cost_usd > 0 && (
              <span className="text-xs text-text-muted">{formatCost(data.costSummary.total_cost_usd)} today</span>
            )}
            <span className={`w-2 h-2 rounded-full ${data.connected ? "bg-green-400" : "bg-text-muted"}`} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {view === "dashboard" && <DashboardView data={data} />}
          {view === "activity" && <ActivityView data={data} />}
          {view === "commits" && <CommitsView data={data} />}
          {view === "sessions" && <SessionsView />}
          {view === "costs" && <CostsView data={data} />}
          {view === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
}

import { TopBar } from "./components/TopBar";
import { ProxyPane } from "./components/proxy/ProxyPane";

// App is now a single-pane shell. Post-pivot Vigil is a Postgres proxy;
// the Tauri app is a thin operator surface over `~/.vigil/proxy.db`.
// The Proxy pane is the only view — it handles its own first-launch
// onboarding (EmptyStateOnboarding when proxy.db doesn't exist on disk)
// and its own polling/Live indicator, so the App-level shell stays
// minimal: a draggable top strip + the pane.
export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-vigil-bg text-vigil-ink">
      <TopBar />
      <main className="flex-1 overflow-hidden">
        <ProxyPane />
      </main>
    </div>
  );
}

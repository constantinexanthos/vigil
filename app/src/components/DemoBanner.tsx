interface DemoBannerProps {
  onConnect: () => void;
  onDismiss: () => void;
  transitionMessage: string | null;
}

export default function DemoBanner({ onConnect, onDismiss, transitionMessage }: DemoBannerProps) {
  if (transitionMessage) {
    return (
      <div
        className="mx-5 mt-2 mb-1 rounded px-4 py-2.5 flex items-center gap-2 text-[12px]"
        style={{ backgroundColor: "#1a2e1a", borderLeft: "3px solid #4ade80" }}
      >
        <span style={{ color: "#4ade80" }}>{transitionMessage}</span>
      </div>
    );
  }

  return (
    <div
      className="mx-5 mt-2 mb-1 rounded px-4 py-2.5 flex items-center gap-2 text-[12px]"
      style={{ backgroundColor: "#2C2C2E", borderLeft: "3px solid #2563EB" }}
    >
      <span className="text-text-muted flex-shrink-0">Viewing sample data</span>
      <button
        onClick={onConnect}
        className="text-[12px] ml-auto flex-shrink-0 hover:underline"
        style={{ color: "#2563EB", background: "none", border: "none", cursor: "pointer" }}
      >
        Connect an agent &rarr;
      </button>
      <button
        onClick={onDismiss}
        className="text-text-faint hover:text-text-muted flex-shrink-0 ml-1"
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}
      >
        &times;
      </button>
    </div>
  );
}

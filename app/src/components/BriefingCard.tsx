interface BriefingCardProps {
  agentCount: number;
  filesChanged: number;
  confidence: number;
  sessionCount: number;
  costUsd: number;
  collisionCount: number;
  lowConfidenceCount: number;
}

function confidenceColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#fbbf24";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

export default function BriefingCard({
  agentCount,
  filesChanged,
  confidence,
  sessionCount,
  costUsd,
  collisionCount,
  lowConfidenceCount,
}: BriefingCardProps) {
  return (
    <div
      style={{
        background: "#151518",
        borderBottom: "1px solid #232530",
        padding: "16px 20px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        {/* Sessions */}
        <div>
          <div style={{ fontSize: "11px", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
            Sessions
          </div>
          <div style={{ fontSize: "20px", fontWeight: 600, color: "#fafafa" }}>
            {sessionCount}
          </div>
          <div style={{ fontSize: "11px", color: "#71717a", marginTop: "2px" }}>
            {agentCount} agent{agentCount !== 1 ? "s" : ""} active
          </div>
        </div>

        {/* Files */}
        <div>
          <div style={{ fontSize: "11px", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
            Files Changed
          </div>
          <div style={{ fontSize: "20px", fontWeight: 600, color: "#fafafa" }}>
            {filesChanged}
          </div>
          <div style={{ fontSize: "11px", color: "#71717a", marginTop: "2px" }}>
            today
          </div>
        </div>

        {/* Confidence */}
        <div>
          <div style={{ fontSize: "11px", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
            Confidence
          </div>
          <div style={{ fontSize: "20px", fontWeight: 600, color: confidence > 0 ? confidenceColor(confidence) : "#71717a" }}>
            {confidence > 0 ? confidence : "—"}
          </div>
          <div style={{ fontSize: "11px", color: lowConfidenceCount > 0 ? "#fbbf24" : "#71717a", marginTop: "2px" }}>
            {lowConfidenceCount > 0 ? `${lowConfidenceCount} need${lowConfidenceCount === 1 ? "s" : ""} review` : "all healthy"}
          </div>
        </div>

        {/* Cost / Alerts */}
        <div>
          <div style={{ fontSize: "11px", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
            {collisionCount > 0 ? "Alerts" : "Cost"}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 600, color: collisionCount > 0 ? "#ef4444" : "#fafafa" }}>
            {collisionCount > 0 ? `${collisionCount} collision${collisionCount !== 1 ? "s" : ""}` : costUsd > 0 ? `$${costUsd.toFixed(2)}` : "—"}
          </div>
          <div style={{ fontSize: "11px", color: "#71717a", marginTop: "2px" }}>
            {collisionCount > 0 ? "files touched by 2+ agents" : costUsd > 0 ? "spent today" : "no cost data"}
          </div>
        </div>
      </div>
    </div>
  );
}

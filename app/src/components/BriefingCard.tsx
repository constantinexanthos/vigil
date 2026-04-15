interface BriefingCardProps {
  agentCount: number;
  filesChanged: number;
  confidence: number;
  sessionCount: number;
  costUsd: number;
  collisionCount: number;
  lowConfidenceCount: number;
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
        padding: "8px 20px",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "13px",
        color: "#a1a1aa",
        lineHeight: "20px",
      }}
    >
      <span>
        <span style={{ color: "#fafafa" }}>{agentCount}</span>
        {" agent"}{agentCount !== 1 ? "s" : ""}{" active"}
      </span>
      <span style={{ margin: "0 8px", opacity: 0.5 }}>{"\u2022"}</span>
      <span>
        <span style={{ color: "#fafafa" }}>{filesChanged}</span>
        {" file"}{filesChanged !== 1 ? "s" : ""}{" changed"}
      </span>
      <span style={{ margin: "0 8px", opacity: 0.5 }}>{"\u2022"}</span>
      <span>
        {"Confidence "}
        <span style={{ color: "#fafafa" }}>{confidence}</span>
      </span>
      <span style={{ margin: "0 8px", opacity: 0.5 }}>{"\u2022"}</span>
      <span>
        <span style={{ color: "#fafafa" }}>{sessionCount}</span>
        {" session"}{sessionCount !== 1 ? "s" : ""}
      </span>
      <span style={{ margin: "0 8px", opacity: 0.5 }}>{"\u2022"}</span>
      <span>
        <span style={{ color: "#fafafa" }}>${costUsd.toFixed(2)}</span>
        {" spent"}
      </span>
      <span style={{ margin: "0 8px", opacity: 0.5 }}>{"\u2022"}</span>
      {collisionCount > 0 ? (
        <span style={{ color: "#fbbf24" }}>
          <span style={{ color: "#fbbf24" }}>{collisionCount}</span>
          {" collision"}{collisionCount !== 1 ? "s" : ""}
        </span>
      ) : (
        <span>No collisions</span>
      )}
      {lowConfidenceCount > 0 && (
        <>
          <span style={{ margin: "0 8px", opacity: 0.5 }}>{"\u2022"}</span>
          <span style={{ color: "#ef4444" }}>
            {lowConfidenceCount} low confidence
          </span>
        </>
      )}
    </div>
  );
}

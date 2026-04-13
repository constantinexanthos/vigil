export default function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 relative overflow-hidden">
      {/* Scan-line effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.015) 2px, rgba(0,255,65,0.015) 4px)",
        }}
      />
      <div
        className="absolute left-0 right-0 h-[2px] pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(0,255,65,0.08), transparent)",
          animation: "scan-line 4s linear infinite",
        }}
      />

      {/* Pulsing circle */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-5"
        style={{
          border: "1.5px solid rgba(0,255,65,0.2)",
          animation: "pulse-ring 2.5s ease-in-out infinite",
          ["--pulse-color" as string]: "rgba(0,255,65,0.15)",
        }}
      >
        <div
          className="w-3 h-3 rounded-full"
          style={{
            backgroundColor: "rgba(0,255,65,0.25)",
            animation: "breathe 2s ease-in-out infinite",
          }}
        />
      </div>

      <p
        className="text-xs font-semibold tracking-[0.3em] uppercase mb-3"
        style={{
          color: "#00ff41",
          opacity: 0.5,
          textShadow: "0 0 10px rgba(0,255,65,0.2)",
        }}
      >
        STANDBY
      </p>

      <p className="text-text-secondary text-[10px] text-center leading-relaxed mb-3">
        Daemon not running. Start monitoring with:
      </p>
      <code
        className="text-[11px] mt-1 px-3 py-1.5 rounded"
        style={{
          color: "#00ff41",
          backgroundColor: "#0d0f12",
          border: "1px solid #1a1d23",
        }}
      >
        vigil watch &lt;dir&gt;
      </code>
    </div>
  );
}

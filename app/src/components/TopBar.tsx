// TopBar is the draggable strip above the Proxy pane. Post-rip the app has
// only one view, so this strip is just the macOS drag region (the window
// is frameless via Tauri's `decorations: false`) plus a quiet wordmark.
//
// Padding left = 82px reserves space for the macOS traffic-light buttons
// so the wordmark doesn't crash into them on the rendered window.
export function TopBar() {
  return (
    <header
      className="h-9 flex items-center border-b border-vigil-rule"
      style={{ paddingLeft: "82px", paddingRight: "10px" }}
      data-tauri-drag-region
    >
      <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-vigil-mute">
        vigil
      </span>
    </header>
  );
}

import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const BINDINGS: { key: string; description: string }[] = [
  { key: "i", description: "Focus the identities list" },
  { key: "f", description: "Focus the decision filter" },
  { key: "j or ↓", description: "Move down in the audit feed" },
  { key: "k or ↑", description: "Move up in the audit feed" },
  { key: "Enter", description: "Filter the feed to the highlighted row's agent" },
  { key: "Esc", description: "Clear filters" },
  { key: "?", description: "Toggle this cheatsheet" },
];

// KeyboardHelp is the `?` cheatsheet modal. Lives outside the pane's
// normal flow as a fixed overlay; Esc closes. We do not pull in a modal
// library (Radix Dialog ships elsewhere in the app but is heavier than
// needed for a one-key cheatsheet).
export function KeyboardHelp({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      data-testid="keyboard-help"
      className="fixed inset-0 z-50 flex items-center justify-center bg-vigil-bg/80"
      onClick={onClose}
    >
      <div
        className="bg-vigil-surface border border-vigil-rule rounded p-5 min-w-[280px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute mb-3">
          Keyboard
        </div>
        <ul className="space-y-1.5">
          {BINDINGS.map(({ key, description }) => (
            <li key={key} className="flex items-center justify-between gap-6 text-[12px]">
              <span className="text-vigil-ink">{description}</span>
              <kbd className="font-mono text-[11px] text-vigil-mute bg-vigil-bg border border-vigil-rule rounded px-1.5 py-0.5">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

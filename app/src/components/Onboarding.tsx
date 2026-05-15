import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  cli: { claude: boolean; codex: boolean };
}

// Onboarding is the first-launch gate. Polished to feel intentional rather
// than rescue-mode: tightened box width (440px), single-row detection
// strip, provider toggle styled like the proxy AuditFeed dropdowns,
// keychain footnote demoted to mute-ink secondary.
export function Onboarding({ cli }: Props) {
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    if (!key.trim()) return;
    setSaving(true);
    try {
      await invoke("save_api_key", { provider, key: key.trim() });
      setSaved(true);
      setKey("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full w-full flex items-center justify-center text-vigil-ink">
      <div className="w-full max-w-[440px] px-8 py-10">
        <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute mb-2">
          Welcome
        </div>
        <div className="text-[20px] font-medium mb-2 leading-tight">
          Connect a Claude to get started
        </div>
        <p className="text-[12.5px] text-vigil-mute leading-relaxed mb-6">
          Vigil watches what AI coding agents are doing and writes plain-English
          summaries of their work. It uses your own Claude Code or Codex to
          generate those summaries — no extra account required.
        </p>

        <div className="border-y border-vigil-rule mb-6">
          <DetectRow label="Claude Code" ok={cli.claude} />
          <DetectRow label="Codex CLI" ok={cli.codex} />
        </div>

        {cli.claude || cli.codex ? (
          <div className="border-l-2 border-vigil-accent px-3 py-2 text-[12.5px] text-vigil-ink">
            Ready — Vigil will use{" "}
            {cli.claude ? "Claude Code" : "Codex"} for summaries.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] text-vigil-mute">
              Neither CLI was detected on your PATH. You can install one, or
              paste an API key below.
            </p>
            <div className="flex items-center gap-1">
              <ProviderButton
                active={provider === "anthropic"}
                onClick={() => setProvider("anthropic")}
              >
                Anthropic
              </ProviderButton>
              <ProviderButton
                active={provider === "openai"}
                onClick={() => setProvider("openai")}
              >
                OpenAI
              </ProviderButton>
            </div>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              className="w-full bg-vigil-surface border border-vigil-rule rounded px-3 py-1.5 text-[12px] text-vigil-ink placeholder-vigil-mute/60 font-mono focus:outline-none focus:border-vigil-accent transition-colors duration-fast"
            />
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !key.trim()}
              className="w-full bg-vigil-surface border border-vigil-rule hover:border-vigil-accent disabled:opacity-40 disabled:cursor-not-allowed text-[12px] text-vigil-ink py-1.5 rounded transition-colors duration-fast"
            >
              {saving
                ? "saving…"
                : saved
                  ? "saved — relaunch Vigil"
                  : "save key in Keychain"}
            </button>
            <p className="text-[10.5px] text-vigil-mute/80">
              Stored securely in macOS Keychain. You can delete it anytime
              from Keychain Access.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 text-[11px] font-mono rounded-sm transition-colors duration-fast ${
        active
          ? "bg-vigil-surface text-vigil-ink border border-vigil-accent"
          : "text-vigil-mute hover:text-vigil-ink border border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

function DetectRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 h-7 text-[12px]">
      <span
        className={`w-1 h-1 rounded-full ${
          ok ? "bg-vigil-accent" : "bg-vigil-mute/40"
        }`}
        aria-hidden
      />
      <span className="text-vigil-ink">{label}</span>
      <span className="ml-auto text-[10px] text-vigil-mute uppercase tracking-[0.10em]">
        {ok ? "detected" : "not found"}
      </span>
    </div>
  );
}

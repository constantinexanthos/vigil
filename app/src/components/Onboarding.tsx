import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  cli: { claude: boolean; codex: boolean };
}

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
    <div className="h-full w-full flex items-center justify-center bg-[#0f0f11] text-white">
      <div className="max-w-md w-full px-6 py-10">
        <div className="text-[18px] font-semibold mb-1.5">Connect a Claude to get started</div>
        <div className="text-[13px] text-white/65 leading-relaxed mb-6">
          Vigil watches what AI coding agents are doing and writes plain-English summaries of their work.
          It uses your own Claude Code or Codex to generate those summaries — no extra account required.
        </div>

        <div className="space-y-2 mb-6">
          <DetectRow label="Claude Code" ok={cli.claude} />
          <DetectRow label="Codex CLI"  ok={cli.codex} />
        </div>

        {(cli.claude || cli.codex) ? (
          <div className="rounded-md border border-emerald-400/20 bg-emerald-400/5 px-3.5 py-2.5 text-[12px] text-white/85">
            Ready — Vigil will use {cli.claude ? "Claude Code" : "Codex"} for summaries.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[12px] text-white/55">
              Neither CLI was detected on your PATH. You can install one, or paste an API key below.
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <button className={`px-2.5 py-1 rounded ${provider === "anthropic" ? "bg-white/10 text-white" : "text-white/55 hover:text-white/85"}`} onClick={() => setProvider("anthropic")}>Anthropic</button>
              <button className={`px-2.5 py-1 rounded ${provider === "openai" ? "bg-white/10 text-white" : "text-white/55 hover:text-white/85"}`} onClick={() => setProvider("openai")}>OpenAI</button>
            </div>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-[12px] text-white/95 placeholder-white/35 font-mono"
            />
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !key.trim()}
              className="w-full bg-white/10 hover:bg-white/15 disabled:opacity-40 text-[12px] text-white py-1.5 rounded transition-colors duration-fast"
            >
              {saving ? "saving…" : saved ? "saved — relaunch Vigil" : "save key in Keychain"}
            </button>
            <div className="text-[11px] text-white/45">Stored securely in macOS Keychain. You can delete it anytime from Keychain Access.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetectRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-white/25"}`} style={{ boxShadow: ok ? "0 0 6px #4ade80" : "none" }} />
      <span className="text-white/85">{label}</span>
      <span className="ml-auto text-[11px] text-white/45">{ok ? "detected" : "not found"}</span>
    </div>
  );
}

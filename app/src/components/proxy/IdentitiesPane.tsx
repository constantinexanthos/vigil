import type { ProxyIdentity } from "../../types";

interface Props {
  identities: ProxyIdentity[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function IdentitiesPane({ identities, selectedId, onSelect }: Props) {
  return (
    <aside
      aria-label="Issued identities"
      className="border-r border-white/[0.06] flex flex-col min-w-0"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <h3 className="text-[9px] uppercase tracking-[0.08em] text-white/35">
          Identities
        </h3>
        {selectedId && (
          <button
            type="button"
            className="text-[10px] text-white/45 hover:text-white/75 transition-colors duration-fast"
            onClick={() => onSelect(null)}
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {identities.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-white/40">
            No identities issued yet.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {identities.map((id) => (
              <li key={id.id}>
                <button
                  type="button"
                  className={`text-left w-full px-3 py-2 transition-colors duration-fast ${
                    selectedId === id.id
                      ? "bg-white/5"
                      : "hover:bg-white/[0.025]"
                  }`}
                  onClick={() => onSelect(id.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-white/85 font-medium">
                      {id.agent_name}
                    </span>
                    <span className="text-[9px] text-white/35 tabular-nums">
                      {expiryLabel(id.expires_at)}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/45 mt-0.5 truncate">
                    {id.principal}
                  </div>
                  {id.scopes.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {id.scopes.map((s) => (
                        <span
                          key={s}
                          className="text-[9px] uppercase tracking-wide text-white/55 bg-white/[0.05] px-1.5 py-0.5 rounded-sm"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function expiryLabel(iso: string): string {
  const expires = new Date(iso).getTime();
  const now = Date.now();
  if (Number.isNaN(expires)) return "?";
  const days = Math.round((expires - now) / 86_400_000);
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(months / 12)}y`;
}

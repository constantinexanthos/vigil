import { forwardRef } from "react";
import type { ProxyIdentity } from "../../types";

interface Props {
  identities: ProxyIdentity[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

// IdentitiesPane is the left rail of the Proxy tab. Compact, scannable,
// keyboard-reachable. Density target (brief acceptance #1): 12+ rows at
// 1440×900. We hit that by collapsing each row to a single line: name +
// principal in a row, expiry on the right. Scopes are surfaced via the
// title attribute (and to screen readers via aria-label) — they're
// secondary metadata the operator can hover for.
export const IdentitiesPane = forwardRef<HTMLDivElement, Props>(
  function IdentitiesPane({ identities, selectedId, onSelect }, listRef) {
    return (
      <aside aria-label="Issued identities" className="border-r border-vigil-rule flex flex-col min-w-0">
        <div className="flex items-center justify-between px-3 h-9 border-b border-vigil-rule">
          <h3 className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute">Identities</h3>
          {selectedId && (
            <button
              type="button"
              className="text-[11px] text-vigil-mute hover:text-vigil-ink transition-colors duration-fast"
              onClick={() => onSelect(null)}
            >
              Clear
            </button>
          )}
        </div>
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto"
          data-testid="identities-list"
          tabIndex={-1}
        >
          {identities.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-vigil-mute">
              No identities issued yet.
            </div>
          ) : (
            <ul>
              {identities.map((id) => {
                const isSelected = selectedId === id.id;
                return (
                  <li key={id.id}>
                    <button
                      type="button"
                      data-testid={`identity-row-${id.id}`}
                      aria-pressed={isSelected}
                      aria-label={`${id.agent_name}, principal ${id.principal}, scopes ${id.scopes.join(",") || "none"}, expires ${expiryLabel(id.expires_at)}`}
                      title={`${id.principal} · scopes: ${id.scopes.join(", ") || "—"}`}
                      className={`text-left w-full px-3 h-9 grid grid-cols-[1fr_auto] items-center gap-2 transition-colors duration-fast border-l-2 ${
                        isSelected
                          ? "bg-vigil-surface border-vigil-accent text-vigil-ink"
                          : "border-transparent hover:bg-vigil-surface text-vigil-ink"
                      }`}
                      onClick={() => onSelect(id.id)}
                    >
                      <div className="min-w-0 flex items-baseline gap-2">
                        <span className="text-[12px] truncate">{id.agent_name}</span>
                        <span className="text-[11px] text-vigil-mute truncate">{id.principal}</span>
                      </div>
                      <span className="text-[10px] text-vigil-mute tabular-nums shrink-0">
                        {expiryLabel(id.expires_at)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    );
  },
);

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

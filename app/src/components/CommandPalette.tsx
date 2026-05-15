import { Command } from "cmdk";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: string[];
  onSelectAgent: (agent: string) => void;
  onClearFilter: () => void;
}

// CommandPalette is the Cmd-K modal. Polished:
// - 13px monospace input — operator gesture, not search-page gesture
// - 28px row height, single accent on hover/selected
// - Vigil palette throughout (was bg-bg-* classes from the v1 token set)
// - Keyboard hint strip docked at the bottom-right of the result list
export default function CommandPalette({
  open,
  onOpenChange,
  agents,
  onSelectAgent,
  onClearFilter,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18%] bg-black/30"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="bg-vigil-bg border border-vigil-rule rounded-lg w-[440px] overflow-hidden"
        style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.45)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="flex flex-col">
          <Command.Input
            placeholder="Search commands..."
            className="w-full px-4 h-10 bg-transparent text-vigil-ink text-[13px] font-mono outline-none border-b border-vigil-rule placeholder:text-vigil-mute/70"
            autoFocus
          />
          <Command.List className="max-h-[300px] overflow-y-auto py-1">
            <Command.Empty className="px-4 py-4 text-[12px] text-vigil-mute text-center">
              No results found.
            </Command.Empty>
            <Command.Group
              heading="Agents"
              className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.10em] text-vigil-mute"
            >
              <Command.Item
                className="px-4 h-7 flex items-center text-[12px] text-vigil-ink cursor-pointer hover:bg-vigil-surface data-[selected=true]:bg-vigil-surface data-[selected=true]:border-l-2 data-[selected=true]:border-vigil-accent transition-colors duration-fast"
                onSelect={onClearFilter}
              >
                Show all agents
              </Command.Item>
              {agents.map((a) => (
                <Command.Item
                  key={a}
                  className="px-4 h-7 flex items-center text-[12px] text-vigil-ink cursor-pointer hover:bg-vigil-surface data-[selected=true]:bg-vigil-surface data-[selected=true]:border-l-2 data-[selected=true]:border-vigil-accent transition-colors duration-fast"
                  onSelect={() => onSelectAgent(a)}
                >
                  Filter: {a}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
          <div className="px-4 h-7 flex items-center justify-end gap-3 border-t border-vigil-rule text-[10px] font-mono text-vigil-mute">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

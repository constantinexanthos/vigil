import { Command } from "cmdk";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: string[];
  onSelectAgent: (agent: string) => void;
  onClearFilter: () => void;
}

export default function CommandPalette({ open, onOpenChange, agents, onSelectAgent, onClearFilter }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20%]" onClick={() => onOpenChange(false)}>
      <div className="bg-bg-secondary rounded-lg shadow-elevated w-[400px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <Command className="flex flex-col">
          <Command.Input
            placeholder="Search commands..."
            className="w-full px-4 py-3 bg-transparent text-text-primary text-lg outline-none border-b border-border placeholder:text-text-muted"
            autoFocus
          />
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-6 text-sm text-text-muted text-center">No results found.</Command.Empty>
            <Command.Group heading="Agents" className="text-xs text-text-muted px-2 py-1">
              <Command.Item className="px-3 py-2 rounded text-sm text-text-secondary cursor-pointer hover:bg-bg-tertiary data-[selected]:bg-bg-tertiary" onSelect={onClearFilter}>
                Show all agents
              </Command.Item>
              {agents.map((a) => (
                <Command.Item key={a} className="px-3 py-2 rounded text-sm text-text-secondary cursor-pointer hover:bg-bg-tertiary data-[selected]:bg-bg-tertiary" onSelect={() => onSelectAgent(a)}>
                  Filter: {a}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

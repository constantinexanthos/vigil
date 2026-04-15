import type { useDaemonData } from "../../hooks";
import EventTimeline from "../EventTimeline";

interface Props {
  data: ReturnType<typeof useDaemonData>;
}

export default function ActivityView({ data }: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-6 pt-4 pb-2">
        <h2 className="text-xs text-text-muted uppercase tracking-wider">Activity</h2>
      </div>
      <EventTimeline
        events={data.events}
        agentFilter={null}
        newEventIds={data.newEventIds}
      />
    </div>
  );
}

import { StatsRow } from "./StatsRow";
import { CollisionBanner } from "./CollisionBanner";
import { AgentGrid } from "./AgentGrid";
import { HourlyChart } from "./HourlyChart";
import { HotspotsPanel } from "./HotspotsPanel";
import type { LiveSessionRow, Collision, FileHeat, HourBucket } from "../../../types";

interface Props {
  liveSessions: LiveSessionRow[];
  collisions: Collision[];
  topEditedFiles: FileHeat[];
  hourlyActivity: HourBucket[];
  burnRatePerHour: number | null;
  activeAgents: number;
  totalAgents: number;
  filesToday: number;
  onSelect: (sessionId: string) => void;
}

export function OverviewPane(props: Props) {
  return (
    <section aria-label="Overview" className="h-full overflow-y-auto">
      <StatsRow
        burnRatePerHour={props.burnRatePerHour}
        activeAgents={props.activeAgents}
        totalAgents={props.totalAgents}
        filesToday={props.filesToday}
      />
      <CollisionBanner collisions={props.collisions} />
      <SectionHeader>Active agents</SectionHeader>
      <AgentGrid liveSessions={props.liveSessions} onSelect={props.onSelect} />
      <SectionHeader>Last 24h</SectionHeader>
      <HourlyChart buckets={props.hourlyActivity} now={new Date()} />
      <SectionHeader>Most edited (last hour)</SectionHeader>
      <HotspotsPanel
        files={props.topEditedFiles}
        collisions={props.collisions}
        repoPath={null}
      />
    </section>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-5 pt-3 pb-1 text-[9px] uppercase tracking-[0.08em] text-white/35">
      {children}
    </h3>
  );
}

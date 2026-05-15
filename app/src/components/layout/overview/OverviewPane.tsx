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
        hourlyActivity={props.hourlyActivity}
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
  // Same treatment as proxy tab section headers — vigil-mute ink, 10px
  // uppercase, 0.10em tracking. Vertical rhythm: 12px top padding (one row
  // height) so sections breathe but don't waste space.
  return (
    <h3 className="px-4 pt-4 pb-1.5 text-[10px] uppercase tracking-[0.10em] text-vigil-mute">
      {children}
    </h3>
  );
}

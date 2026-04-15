import RainingLetters from "@/components/ui/modern-animated-hero-section"
import { DarkFeatureGrid } from "@/components/ui/dark-feature-grid"
import { TerminalDemo } from "@/components/terminal-demo"
import { HowItWorks } from "@/components/how-it-works"
import { Architecture } from "@/components/architecture"
import { Integrations } from "@/components/integrations"

export default function Home() {
  return (
    <main>
      <RainingLetters />
      <TerminalDemo />
      <DarkFeatureGrid />
      <HowItWorks />
      <Architecture />
      <Integrations />
    </main>
  )
}

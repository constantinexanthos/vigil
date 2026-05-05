import { HomeView } from "@/components/bevigil/home-view"
import { AgentView } from "@/components/bevigil/agent-view"
import { resolveViewFromSearchParams } from "@/components/bevigil/view"

// In Next 16, searchParams is a Promise on server components.
type SearchParamsPromise = Promise<
  Record<string, string | string[] | undefined>
>

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParamsPromise
}) {
  const view = resolveViewFromSearchParams(await searchParams)
  return view === "agent" ? <AgentView page="home" /> : <HomeView />
}

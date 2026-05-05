import type { Metadata } from "next"
import { AboutView } from "@/components/bevigil/about-view"
import { AgentView } from "@/components/bevigil/agent-view"
import { resolveViewFromSearchParams } from "@/components/bevigil/view"

export const metadata: Metadata = {
  title: "About — Vigil",
  description:
    "Vigil is built by Costa Xanthos in 2026. The agent-aware data plane between AI agents and the systems they touch.",
}

type SearchParamsPromise = Promise<
  Record<string, string | string[] | undefined>
>

export default async function AboutPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise
}) {
  const view = resolveViewFromSearchParams(await searchParams)
  return view === "agent" ? <AgentView page="about" /> : <AboutView />
}

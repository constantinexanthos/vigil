import type { Metadata } from "next"
import { DocsView } from "@/components/bevigil/docs-view"
import { AgentView } from "@/components/bevigil/agent-view"
import { resolveViewFromSearchParams } from "@/components/bevigil/view"

export const metadata: Metadata = {
  title: "Docs — Vigil",
  description:
    "Get started with Vigil. Quickstart for the proxy: issue an agent identity, fetch it back, list every identity Vigil has ever issued.",
}

type SearchParamsPromise = Promise<
  Record<string, string | string[] | undefined>
>

export default async function DocsPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise
}) {
  const view = resolveViewFromSearchParams(await searchParams)
  return view === "agent" ? <AgentView page="docs" /> : <DocsView />
}

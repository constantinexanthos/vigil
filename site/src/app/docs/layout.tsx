import { DocsSidebar } from "@/components/docs-sidebar"

export const metadata = {
  title: "Docs — Vigil",
  description: "Documentation for Vigil, the control panel for coding agents.",
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen pt-[64px]">
      <DocsSidebar />
      <main className="flex-1 md:ml-[240px] px-6 md:px-12 py-12 max-w-3xl">
        {children}
      </main>
    </div>
  )
}

import TerminalDemo, { InstallCommand } from "@/components/terminal-demo";
import Features from "@/components/features";
import Architecture from "@/components/architecture";
import Integrations from "@/components/integrations";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative hero-grid">
        <div className="hero-glow">
          <div className="mx-auto max-w-5xl px-6 pt-28 pb-24 sm:px-8 sm:pt-36 sm:pb-32">
            <h1 className="font-mono text-3xl font-bold leading-tight tracking-tight text-text sm:text-5xl max-w-3xl">
              The control plane for coding agents
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-muted">
              Monitor every AI agent on your machine -- Claude Code, Cursor,
              Codex, Conductor -- in one dashboard. See what they&apos;re
              doing, what they&apos;re costing, and whether you should trust
              their output.
            </p>

            <div className="mt-8">
              <InstallCommand />
            </div>

            <div className="mt-12">
              <TerminalDemo />
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-border" />

      <Features />

      <div className="border-t border-border" />

      <Architecture />

      <div className="border-t border-border" />

      <Integrations />

      <Footer />
    </>
  );
}

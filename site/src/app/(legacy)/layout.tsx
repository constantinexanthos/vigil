import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { RainingBackground } from "@/components/raining-background";

export const metadata = {
  title: "Vigil — Legacy marketing",
  description:
    "Older Vigil marketing pages, archived under /old. The current landing lives at /.",
};

// The legacy route group keeps the original dark Vigil chrome alive.
// .theme-legacy on this wrapper scopes the dark CSS variables defined
// in globals.css to this subtree only.
export default function LegacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-legacy min-h-screen bg-background text-foreground font-mono">
      <RainingBackground variant="full" />
      <Nav />
      <div className="relative z-10">{children}</div>
      <Footer />
    </div>
  );
}

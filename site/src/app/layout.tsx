import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter } from "next/font/google";
import "./globals.css";

// Inter is the type stack for the new bevigil.ai landing.
// IBM Plex stays available for the legacy /old/* subtree.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Vigil — The seatbelt for your agent fleet",
  description:
    "Vigil is the agent-aware data plane that sits between your AI agents and your databases, APIs, and services. Per-agent identity, smart rate limiting, fan-out coalescing, blast-radius control. Open source. Single binary. Free for individuals.",
  openGraph: {
    title: "Vigil — The seatbelt for your agent fleet",
    description:
      "The agent-aware data plane between your AI agents and your databases, APIs, and services.",
    type: "website",
    url: "https://bevigil.ai",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${ibmPlexMono.variable} ${ibmPlexSans.variable} antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}

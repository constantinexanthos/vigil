import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { RainingBackground } from "@/components/raining-background";
import "./globals.css";

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
  title: "Vigil — The control panel for coding agents",
  description:
    "Monitor every AI coding agent on your machine. See what they're doing, what they're costing, and whether you should trust their output.",
  openGraph: {
    title: "Vigil — The control panel for coding agents",
    description:
      "Monitor every AI coding agent on your machine. See what they're doing, what they're costing, and whether you should trust their output.",
    type: "website",
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
      className={`${ibmPlexMono.variable} ${ibmPlexSans.variable} antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground">
        <RainingBackground />
        <Nav />
        <div className="relative z-10">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}

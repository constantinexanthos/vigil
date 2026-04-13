import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vigil -- The control plane for coding agents",
  description:
    "Monitor every AI agent on your machine. See what they're doing, what they're costing, and whether you should trust their output.",
  openGraph: {
    title: "Vigil -- The control plane for coding agents",
    description:
      "Monitor every AI agent on your machine in one dashboard.",
    siteName: "Vigil",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="scanlines min-h-full flex flex-col">{children}</body>
    </html>
  );
}

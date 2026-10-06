import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas", display: "swap" });

const title = "GTA V Story AI — a specialist for Los Santos";
const description =
  "A domain-specific AI knowledge agent for Grand Theft Auto V Story Mode: grounded answers with sources, missions, heists, collectibles, cheats and map locations. Retrieval-Augmented Generation on PostgreSQL + pgvector.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title,
  description,
  applicationName: "GTA V Story AI",
  keywords: ["GTA V", "Story Mode", "RAG", "AI agent", "pgvector", "Next.js"],
  openGraph: { title, description, type: "website", siteName: "GTA V Story AI", locale: "en_US" },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#09090a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bebas.variable}`}>
      <body>{children}</body>
    </html>
  );
}

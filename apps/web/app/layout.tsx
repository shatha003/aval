import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { WorldProvider } from "@/lib/world-context";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", axes: ["wdth", "opsz"] });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "AVAL · Papers, please",
  description:
    "A trust layer for AI agents: signed identity, scoped authority, co-signed history, and a gate that prints a verifiable receipt for every decision.",
};

export const viewport: Viewport = { themeColor: "#2130e0" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <WorldProvider>
          <header className="masthead">
            <Link href="/" className="wordmark" aria-label="AVAL home">
              <span className="wordmark-name">Aval</span>
              <span className="wordmark-sub">Border control for AI agents</span>
            </Link>
            <Nav />
          </header>
          {children}
          <footer className="foot">
            <span>Every key in this demo comes from a public seed. Nothing here protects anything real.</span>
            <span className="mono">did:key / W3C VC 2.0 / eddsa-jcs-2022</span>
          </footer>
        </WorldProvider>
      </body>
    </html>
  );
}

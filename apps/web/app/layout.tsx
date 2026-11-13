import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { WorldProvider } from "@/lib/world-context";
import "./globals.css";
import "./pages.css";
import "./pitch.css";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "AVAL · a checkpoint for agents",
  description:
    "A trust layer for agents: signed credentials, scoped authority, co-signed history, and a gate that prints a verifiable receipt for every decision.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        {/* Rough-edged ink for stamps. Defined once, referenced by CSS. */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
          <defs>
            <filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
            </filter>
          </defs>
        </svg>
        <WorldProvider>
          <header className="masthead">
            <Link href="/" className="wordmark" aria-label="AVAL home">
              <span className="wordmark-name">Aval</span>
              <span className="wordmark-sub">a checkpoint for agents</span>
            </Link>
            <nav className="nav" aria-label="Primary">
              <Link href="/">The Floor</Link>
              <Link href="/attacks">Attack Lab</Link>
              <Link href="/verify">Verify it yourself</Link>
              <Link href="/architecture">Architecture</Link>
            </nav>
          </header>
          {children}
          <footer className="foot">
            <span>All keys in this demo are derived from public seeds. Nothing here protects anything real.</span>
            <span className="mono">did:key · W3C VC 2.0 · eddsa-jcs-2022</span>
          </footer>
        </WorldProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "HANAB BMS",
  description: "Bedrijfsmanagementsysteem ondergrondse infra — kabels elektra & leidingen water",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <header className="sticky top-0 z-30 border-b-2 border-hanab-accent bg-hanab-900/95 text-white shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo-white.svg" alt="Hanab" className="h-7 w-auto" />
              <div className="leading-tight border-l border-white/25 pl-3">
                <div className="text-base font-semibold">BMS</div>
                <div className="text-xs text-slate-300">Ondergrondse infra · kabels &amp; leidingen</div>
              </div>
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
                Dashboard
              </Link>
              <Link href="/instellingen" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
                Instellingen
              </Link>
              <Link href="/projecten/nieuw" className="rounded-lg bg-hanab-accent px-3 py-1.5 font-medium hover:bg-hanab-accentDark">
                + Nieuw project
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-slate-400">
          HANAB BMS · lokale ontwikkelversie · intakeproces (conditionerende onderzoeken)
        </footer>
      </body>
    </html>
  );
}

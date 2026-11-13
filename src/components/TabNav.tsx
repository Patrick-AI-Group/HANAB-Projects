"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TabNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projecten/${projectId}`;
  const tabs = [
    { href: `${base}/kaart`, label: "Kaart & tracé" },
    { href: `${base}/intake`, label: "Onderzoeken" },
    { href: `${base}/voorcalculatie`, label: "Voorcalculatie" },
    { href: `${base}/materiaal`, label: "Materiaal (MBB)" },
    { href: `${base}/werktekeningen`, label: "Werktekeningen" },
    { href: `${base}/dossier`, label: "Dossier" },
    { href: `${base}/uitvoering`, label: "Uitvoering" },
    { href: `${base}/afrekening`, label: "Afrekening" },
  ];
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const actief = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              actief
                ? "border-hanab-accent text-hanab-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

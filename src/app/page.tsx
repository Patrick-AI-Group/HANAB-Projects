import Link from "next/link";
import { prisma } from "@/lib/db";
import { OnderzoekStatusBadge, ProjectStatusBadge } from "@/components/Badges";
import { Icon } from "@/components/visuals";
import {
  labelOnderzoek,
  labelProjectType,
  onderzoekGereed,
  onderzoekOpenstaand,
} from "@/lib/domein";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("nl-NL") : "—";
}

type Filter = "intake" | "onderzoeken" | "open";

const FILTER_TITELS: Record<Filter, string> = {
  intake: "Projecten in intake / voorbereiding",
  onderzoeken: "Alle conditionerende onderzoeken",
  open: "Onderzoeken nog aan te vragen",
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const projecten = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: { onderzoeken: true },
  });

  const totaalProjecten = projecten.length;
  const alleOnderzoeken = projecten.flatMap((p) => p.onderzoeken);
  const openOnderzoeken = alleOnderzoeken.filter((o) => onderzoekOpenstaand(o.status)).length;
  const inIntake = projecten.filter((p) => p.status === "INTAKE" || p.status === "VOORBEREIDING").length;

  const ruwFilter = searchParams.filter;
  const filter: Filter | null =
    ruwFilter === "intake" || ruwFilter === "onderzoeken" || ruwFilter === "open"
      ? ruwFilter
      : null;

  const kpis = [
    { label: "Projecten", waarde: totaalProjecten, Icon: Icon.Projecten, href: "/", actief: filter === null },
    { label: "In intake / voorbereiding", waarde: inIntake, Icon: Icon.Tekening, href: "/?filter=intake", actief: filter === "intake" },
    { label: "Conditionerende onderzoeken", waarde: alleOnderzoeken.length, Icon: Icon.Onderzoek, href: "/?filter=onderzoeken", actief: filter === "onderzoeken" },
    { label: "Nog aan te vragen", waarde: openOnderzoeken, accent: openOnderzoeken > 0, Icon: Icon.Waarschuwing, href: "/?filter=open", actief: filter === "open" },
  ];

  // Welke projecten in de projectentabel (alleen voor project-filters).
  const zichtbareProjecten =
    filter === "intake"
      ? projecten.filter((p) => p.status === "INTAKE" || p.status === "VOORBEREIDING")
      : projecten;

  // Onderzoeken platgeslagen met hun project, voor de onderzoek-filters.
  const onderzoekRegels = projecten
    .flatMap((p) => p.onderzoeken.map((o) => ({ onderzoek: o, project: p })))
    .filter(({ onderzoek }) => (filter === "open" ? onderzoekOpenstaand(onderzoek.status) : true))
    .sort((a, b) => b.onderzoek.updatedAt.getTime() - a.onderzoek.updatedAt.getTime());

  const toontOnderzoeken = filter === "onderzoeken" || filter === "open";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl shadow-lg ring-1 ring-hanab-900/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/hero.jpg" alt="HANAB ondergrondse infra" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-hanab-900 via-hanab-900/85 to-hanab-900/40" />
        <div className="relative flex flex-wrap items-end justify-between gap-6 px-7 py-10">
          <div className="max-w-xl text-white">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-hanab-accent" />
              Bedrijfsmanagementsysteem
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Ondergrondse infra, slim beheerd</h1>
            <p className="mt-2 text-sm text-slate-200">
              Van intake tot oplevering — kabels elektra en leidingen water. AI ondersteunt
              onderzoeken, calculatie, bestellingen en de weekadministratie.
            </p>
          </div>
          <Link
            href="/projecten/nieuw"
            className="rounded-lg bg-hanab-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-hanab-accentDark"
          >
            + Nieuw project
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            aria-current={k.actief ? "true" : undefined}
            className={`card flex items-center gap-4 p-4 transition-all hover:shadow-md hover:ring-hanab-light ${
              k.actief ? "ring-2 ring-hanab-500" : ""
            }`}
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                k.accent ? "bg-hanab-accent/10 text-hanab-accent" : "bg-hanab-50 text-hanab-700"
              }`}
            >
              <k.Icon className="h-6 w-6" />
            </span>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</div>
              <div className={`text-2xl font-bold ${k.accent ? "text-hanab-accent" : "text-hanab-900"}`}>
                {k.waarde}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold">
            {filter ? FILTER_TITELS[filter] : "Projecten"}
            <span className="ml-2 text-sm font-normal text-slate-400">
              {toontOnderzoeken ? onderzoekRegels.length : zichtbareProjecten.length}
            </span>
          </h2>
          {filter && (
            <Link href="/" className="text-sm font-medium text-hanab-700 hover:underline">
              Wis filter
            </Link>
          )}
        </div>

        {toontOnderzoeken ? (
          onderzoekRegels.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">Geen onderzoeken in dit overzicht.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Onderzoek</th>
                  <th className="px-5 py-2.5 font-medium">Project</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Uitvoerder</th>
                  <th className="px-5 py-2.5 font-medium">Verwacht klaar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {onderzoekRegels.map(({ onderzoek: o, project: p }) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/projecten/${p.id}`} className="font-medium text-hanab-800 hover:underline">
                        {o.titel || labelOnderzoek(o.type)}
                      </Link>
                      {o.titel && <div className="text-xs text-slate-500">{labelOnderzoek(o.type)}</div>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <Link href={`/projecten/${p.id}`} className="hover:underline">
                        {p.naam}
                      </Link>
                      <div className="text-xs text-slate-500">{p.projectnummer}</div>
                    </td>
                    <td className="px-5 py-3">
                      <OnderzoekStatusBadge status={o.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-600">{o.uitvoerder || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{fmt(o.verwachtKlaar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : zichtbareProjecten.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            {filter ? (
              "Geen projecten in dit overzicht."
            ) : (
              <>
                Nog geen projecten.{" "}
                <Link href="/projecten/nieuw" className="font-medium text-hanab-700 underline">
                  Maak het eerste project aan
                </Link>
                .
              </>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">Project</th>
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Onderzoeken</th>
                <th className="px-5 py-2.5 font-medium">Oplevering</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {zichtbareProjecten.map((p) => {
                const gereed = p.onderzoeken.filter((o) => onderzoekGereed(o.status)).length;
                const totaal = p.onderzoeken.length;
                const pct = totaal === 0 ? 0 : Math.round((gereed / totaal) * 100);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/projecten/${p.id}`} className="font-medium text-hanab-800 hover:underline">
                        {p.naam}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {p.projectnummer} · {p.opdrachtgever}
                        {p.plaats ? ` · ${p.plaats}` : ""}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{labelProjectType(p.type)}</td>
                    <td className="px-5 py-3">
                      <ProjectStatusBadge status={p.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-hanab-600" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500">
                          {gereed}/{totaal}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{fmt(p.opleverdatum)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

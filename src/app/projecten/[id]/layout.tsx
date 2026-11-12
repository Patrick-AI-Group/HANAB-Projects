import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProjectStatusBadge } from "@/components/Badges";
import { TabNav } from "@/components/TabNav";
import { PROJECT_STATUS, labelProjectType, onderzoekGereed } from "@/lib/domein";
import { wijzigProjectStatus } from "@/app/actions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("nl-NL") : "—";
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { onderzoeken: { select: { status: true, verplicht: true } } },
  });
  if (!project) notFound();

  const totaal = project.onderzoeken.length;
  const gereed = project.onderzoeken.filter((o) => onderzoekGereed(o.status)).length;
  const verplichtOpen = project.onderzoeken.filter((o) => o.verplicht && !onderzoekGereed(o.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-hanab-700 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <div className="card overflow-hidden">
        {/* Cover-banner met HANAB-beeld per werktype */}
        <div className="relative h-40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              project.type === "LEIDINGEN_WATER"
                ? "/images/pipes.jpg"
                : project.type === "KABELS_ELEKTRA"
                  ? "/images/rigs.jpg"
                  : "/images/dodewaard.jpg"
            }
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-hanab-900 via-hanab-900/70 to-hanab-900/25" />
          <div className="absolute inset-x-0 bottom-0 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-sm">{project.naam}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="mt-1 text-sm text-slate-200">
              {project.projectnummer} · {project.opdrachtgever} · {labelProjectType(project.type)}
              {project.plaats ? ` · ${project.plaats}` : ""}
            </p>
          </div>
        </div>

        <div className="p-6">
          {project.omschrijving && (
            <p className="max-w-3xl text-sm text-slate-700">{project.omschrijving}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-6 text-sm text-slate-600">
              <span>
                Start: <strong>{fmt(project.startdatum)}</strong>
              </span>
              <span>
                Oplevering: <strong>{fmt(project.opleverdatum)}</strong>
              </span>
            </div>
            <form action={wijzigProjectStatus} className="flex items-center gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <select name="status" defaultValue={project.status} className="input w-44">
                {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button className="btn-ghost" type="submit">
                Fase bijwerken
              </button>
            </form>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Onderzoeken</div>
            <div className="text-xl font-semibold">{totaal}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Beoordeeld / akkoord</div>
            <div className="text-xl font-semibold">
              {gereed}/{totaal}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Verplicht nog open</div>
            <div className={`text-xl font-semibold ${verplichtOpen > 0 ? "text-hanab-accent" : ""}`}>
              {verplichtOpen}
            </div>
          </div>
          </div>
        </div>
      </div>

      <TabNav projectId={project.id} />

      {children}
    </div>
  );
}

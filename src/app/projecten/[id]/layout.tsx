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
    <div className="space-y-4">
      <div className="card overflow-hidden">
        {/* Compacte cover-banner met HANAB-beeld per werktype */}
        <div className="relative h-24">
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
          <div className="absolute inset-0 bg-gradient-to-t from-hanab-900 via-hanab-900/75 to-hanab-900/30" />
          <Link
            href="/"
            className="absolute left-4 top-2.5 text-xs font-medium text-white/80 drop-shadow hover:text-white"
          >
            ← Dashboard
          </Link>
          <div className="absolute inset-x-0 bottom-0 px-4 pb-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-sm">{project.naam}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-200">
              {project.projectnummer} · {project.opdrachtgever} · {labelProjectType(project.type)}
              {project.plaats ? ` · ${project.plaats}` : ""}
            </p>
          </div>
        </div>

        {/* Slanke infobalk: omschrijving, data en kerncijfers inline */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
          {project.omschrijving && (
            <span className="min-w-0 max-w-sm truncate text-slate-500" title={project.omschrijving}>
              {project.omschrijving}
            </span>
          )}
          <span>
            Start <strong className="text-slate-800">{fmt(project.startdatum)}</strong>
          </span>
          <span>
            Oplevering <strong className="text-slate-800">{fmt(project.opleverdatum)}</strong>
          </span>
          <span className="hidden h-4 w-px bg-slate-200 sm:block" />
          <span>
            Onderzoeken <strong className="text-slate-800">{totaal}</strong>
          </span>
          <span>
            Akkoord <strong className="text-slate-800">{gereed}/{totaal}</strong>
          </span>
          <span>
            Verplicht open{" "}
            <strong className={verplichtOpen > 0 ? "text-hanab-accent" : "text-slate-800"}>{verplichtOpen}</strong>
          </span>
          <form action={wijzigProjectStatus} className="ml-auto flex items-center gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <select name="status" defaultValue={project.status} className="input w-40 py-1 text-xs">
              {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="btn-ghost px-3 py-1 text-xs" type="submit">
              Fase bijwerken
            </button>
          </form>
        </div>
      </div>

      <TabNav projectId={project.id} />

      {children}
    </div>
  );
}

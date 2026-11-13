import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SubmitKnop } from "@/components/SubmitKnop";
import { labelDocumentCategorie } from "@/lib/domein";
import { genereerDossierDocumentenAction } from "@/app/actions";

export const dynamic = "force-dynamic";
// AI-acties (Claude) duren ~20-40s; verhoog de serverless-timeout zodat Vercel
// de functie niet na de standaard 10s afkapt (max 60s op Hobby, 300s op Pro).
export const maxDuration = 60;

function fmtTijd(d: Date) {
  return d.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export default async function ProjectDossier({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      documenten: { orderBy: { naam: "asc" } },
      activiteiten: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  });
  if (!project) notFound();

  return (
    <div className="space-y-6">
      {/* Documenten / dossier */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Projectdossier &amp; documenten</h2>
            <p className="text-xs text-slate-500">
              Gegenereerde dossierstukken (HTML printbaar, CSV, PDF, Word, ZIP) — opgeslagen in Vercel Blob (productie) of lokaal onder <code>/public/docs</code>
            </p>
          </div>
          <form action={genereerDossierDocumentenAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <SubmitKnop title="Genereer/ververs alle dossierdocumenten" bezigLabel="Documenten genereren…">
              📄 Genereer dossierdocumenten
            </SubmitKnop>
          </form>
        </div>

        {project.documenten.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Nog geen documenten. Klik op <strong>Genereer dossierdocumenten</strong> om het volledige
            dossier (bureauonderzoek, VOCA, MBB, tekeningen, weekstaten, termijnstaat, revisies) als
            bestanden op te slaan.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {project.documenten.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{d.naam}</div>
                  <div className="text-xs text-slate-500">{labelDocumentCategorie(d.categorie ?? "OVERIG")}</div>
                </div>
                {d.pad && (
                  <a
                    href={d.pad}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                  >
                    Openen ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Activiteiten / logboek */}
      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Activiteiten &amp; AI-log</h2>
        {project.activiteiten.length === 0 ? (
          <p className="text-sm text-slate-500">Nog geen activiteiten.</p>
        ) : (
          <ol className="space-y-3">
            {project.activiteiten.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span
                  className={`mt-0.5 inline-flex h-6 shrink-0 items-center rounded px-2 text-xs font-medium ${
                    a.type === "AI"
                      ? "bg-amber-100 text-amber-800"
                      : a.type === "WAARSCHUWING"
                        ? "bg-rose-100 text-rose-700"
                        : a.type === "STATUS"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {a.type}
                </span>
                <div>
                  <div className="text-slate-700">{a.bericht}</div>
                  <div className="text-xs text-slate-400">{fmtTijd(a.createdAt)}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

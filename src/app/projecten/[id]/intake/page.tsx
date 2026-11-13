import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { OnderzoekStatusBadge } from "@/components/Badges";
import { SubmitKnop } from "@/components/SubmitKnop";
import { RapportStream } from "@/components/RapportStream";
import {
  ONDERZOEK_STATUS,
  ONDERZOEK_TYPES,
  labelDocumentCategorie,
  labelOnderzoek,
} from "@/lib/domein";
import {
  genereerMonitoring,
  genereerOnderzoeksadvies,
  voegOnderzoekToe,
  verwijderOnderzoek,
  wijzigOnderzoekStatus,
} from "@/app/actions";

export const dynamic = "force-dynamic";
// AI-acties (Claude) duren ~20-40s; verhoog de serverless-timeout zodat Vercel
// de functie niet na de standaard 10s afkapt (max 60s op Hobby, 300s op Pro).
export const maxDuration = 60;

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("nl-NL") : "—";
}

export default async function ProjectIntake({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      onderzoeken: {
        orderBy: { createdAt: "asc" },
        include: { documenten: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!project) notFound();

  const heeftSleutel = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());

  return (
    <div className="space-y-6">
      {/* Conditionerende onderzoeken */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Conditionerende onderzoeken</h2>
            <p className="text-xs text-slate-500">
              Aanvragen en monitoren · AI-gedreven intake
              {!heeftSleutel && " · lokale AI-fallback actief (geen API-sleutel)"}
            </p>
          </div>
          <div className="flex gap-2">
            <form action={genereerOnderzoeksadvies}>
              <input type="hidden" name="projectId" value={project.id} />
              <SubmitKnop title="Laat AI benodigde onderzoeken adviseren" bezigLabel="AI adviseert…">
                ✨ AI-onderzoeksadvies
              </SubmitKnop>
            </form>
            <form action={genereerMonitoring}>
              <input type="hidden" name="projectId" value={project.id} />
              <SubmitKnop className="btn-ghost" title="AI-duiding op voortgang en risico's" bezigLabel="AI analyseert…">
                AI-monitoring
              </SubmitKnop>
            </form>
          </div>
        </div>

        {project.onderzoeken.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Nog geen onderzoeken. Klik op <strong>AI-onderzoeksadvies</strong> om op basis van de
            projectscope een advieslijst te genereren, of voeg hieronder handmatig toe.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {project.onderzoeken.map((o) => (
              <div key={o.id} className="px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{o.titel ?? labelOnderzoek(o.type)}</span>
                      {o.verplicht && (
                        <span className="badge bg-rose-50 text-rose-700 ring-rose-200">verplicht</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {labelOnderzoek(o.type)}
                      {o.uitvoerder ? ` · ${o.uitvoerder}` : ""}
                      {o.verwachtKlaar ? ` · verwacht: ${fmt(o.verwachtKlaar)}` : ""}
                      {o.aanvraagdatum ? ` · aangevraagd: ${fmt(o.aanvraagdatum)}` : ""}
                      {o.ontvangstdatum ? ` · ontvangen: ${fmt(o.ontvangstdatum)}` : ""}
                    </div>
                    {o.aiRationale && (
                      <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-100">
                        <span className="font-semibold">AI-onderbouwing: </span>
                        {o.aiRationale}
                      </div>
                    )}
                    <div className="mt-2">
                      <RapportStream
                        onderzoekId={o.id}
                        bestaand={!!o.rapport}
                        rapportPad={o.rapportPad}
                      />
                    </div>
                    {o.rapport && (
                      <details className="mt-2 rounded-md bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                        <summary className="cursor-pointer text-xs font-medium text-slate-700">
                          AI-rapport {o.rapportBron === "claude" ? "(Claude)" : "(lokale regels)"} — tonen
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">
                          {o.rapport}
                        </pre>
                      </details>
                    )}
                    {o.documenten.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-slate-600">Documenten</div>
                        <ul className="mt-1 space-y-1">
                          {o.documenten.map((d) => (
                            <li key={d.id} className="flex items-center gap-2 text-xs">
                              <span className="truncate text-slate-700">{d.naam}</span>
                              <span className="shrink-0 text-slate-400">
                                {labelDocumentCategorie(d.categorie ?? "OVERIG")}
                              </span>
                              {d.pad && (
                                <a
                                  href={d.pad}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="shrink-0 font-medium text-hanab-700 hover:underline"
                                >
                                  openen ↗
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <OnderzoekStatusBadge status={o.status} />
                    <form action={wijzigOnderzoekStatus} className="flex items-center gap-1">
                      <input type="hidden" name="onderzoekId" value={o.id} />
                      <input type="hidden" name="projectId" value={project.id} />
                      <select name="status" defaultValue={o.status} className="input w-40 py-1.5 text-xs">
                        {Object.entries(ONDERZOEK_STATUS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <button className="btn-ghost px-2 py-1.5 text-xs" type="submit">
                        Opslaan
                      </button>
                    </form>
                    <form action={verwijderOnderzoek}>
                      <input type="hidden" name="onderzoekId" value={o.id} />
                      <input type="hidden" name="projectId" value={project.id} />
                      <button
                        className="btn-ghost px-2 py-1.5 text-xs text-rose-600 ring-rose-200 hover:bg-rose-50"
                        type="submit"
                        title="Verwijderen"
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <form action={voegOnderzoekToe} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="w-56">
              <label className="label text-xs">Type onderzoek</label>
              <select name="type" className="input py-1.5 text-sm" defaultValue="KLIC">
                {Object.entries(ONDERZOEK_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[12rem]">
              <label className="label text-xs">Titel (optioneel)</label>
              <input name="titel" className="input py-1.5 text-sm" placeholder="korte omschrijving" />
            </div>
            <div className="w-44">
              <label className="label text-xs">Uitvoerder</label>
              <input name="uitvoerder" className="input py-1.5 text-sm" placeholder="bureau / instantie" />
            </div>
            <div className="w-40">
              <label className="label text-xs">Verwacht klaar</label>
              <input name="verwachtKlaar" type="date" className="input py-1.5 text-sm" />
            </div>
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="verplicht" className="h-4 w-4 rounded border-slate-300" />
              verplicht
            </label>
            <button className="btn-primary" type="submit">
              Toevoegen
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

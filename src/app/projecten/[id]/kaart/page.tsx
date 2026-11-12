import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SubmitKnop } from "@/components/SubmitKnop";
import { MapTrace } from "@/components/MapTrace";
import { genereerBureauonderzoek, onderzoekenUitBureauonderzoek, snapTraceAanDeWeg } from "@/app/actions";
import { traceCoords, traceLengteMeter, type BronBevinding } from "@/lib/opendata";

export const dynamic = "force-dynamic";
// Bureauonderzoek (Claude + externe bronnen) kan ~20-40s duren.
export const maxDuration = 60;

function fmtTijd(d: Date | null) {
  return d ? d.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export default async function ProjectKaart({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { bureauonderzoek: true },
  });
  if (!project) notFound();

  const coords = traceCoords(project.traceGeoJson);
  const lengte = coords.length >= 2 ? traceLengteMeter(coords) : 0;
  const heeftTrace = coords.length >= 2;

  const bo = project.bureauonderzoek;
  let bevindingen: BronBevinding[] = [];
  if (bo?.bevindingenJson) {
    try {
      bevindingen = JSON.parse(bo.bevindingenJson);
    } catch {
      bevindingen = [];
    }
  }

  return (
    <div className="space-y-6">
      {/* Kaart + tracé */}
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Tracé intekenen</h2>
            <p className="text-xs text-slate-500">
              Teken het tracé op de kaart. Het bureauonderzoek raadpleegt open data (BRO, PDOK) langs dit tracé.
            </p>
          </div>
          {heeftTrace && (
            <div className="flex items-center gap-2">
              <span className="badge bg-emerald-100 text-emerald-800 ring-emerald-200">
                tracé opgeslagen · {lengte} m
              </span>
              <form action={snapTraceAanDeWeg}>
                <input type="hidden" name="projectId" value={project.id} />
                <button className="btn-ghost px-3 py-1.5 text-xs" type="submit" title="Leg het tracé op de dichtstbijzijnde wegroute (berm)">
                  🛣️ Op de weg leggen
                </button>
              </form>
            </div>
          )}
        </div>
        <MapTrace projectId={project.id} initialTrace={project.traceGeoJson} />
      </div>

      {/* Bureauonderzoek */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Bureauonderzoek conditionerende onderzoeken</h2>
            <p className="text-xs text-slate-500">
              Open-data-bevindingen langs het tracé, door AI samengevat tot een rapport
              {bo?.gegenereerdOp ? ` · laatst gegenereerd ${fmtTijd(bo.gegenereerdOp)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {bo && (
              <form action={onderzoekenUitBureauonderzoek}>
                <input type="hidden" name="projectId" value={project.id} />
                <button className="btn-ghost" type="submit" title="Zet de bevindingen om in conditionerende onderzoeken op de Intake-tab">
                  → Zet in onderzoekenlijst
                </button>
              </form>
            )}
            <form action={genereerBureauonderzoek}>
              <input type="hidden" name="projectId" value={project.id} />
              <SubmitKnop
                disabled={!heeftTrace}
                bezigLabel="Open bronnen raadplegen…"
                title={heeftTrace ? "Raadpleeg open data en genereer rapport" : "Teken en bewaar eerst een tracé"}
              >
                ✨ Genereer bureauonderzoek
              </SubmitKnop>
            </form>
          </div>
        </div>

        {!heeftTrace ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Teken eerst een tracé hierboven en sla het op. Daarna raadpleegt het bureauonderzoek de open
            bronnen langs dat tracé.
          </div>
        ) : !bo ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Tracé staat klaar. Klik op <strong>Genereer bureauonderzoek</strong> om de open bronnen te
            raadplegen en een rapport te laten schrijven.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Bevindingen per bron */}
            <div className="grid gap-3 p-6 sm:grid-cols-2">
              {bevindingen.map((b, i) => (
                <div key={i} className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-hanab-900">{b.thema}</span>
                    {b.beschikbaar ? (
                      <span className="badge bg-emerald-100 text-emerald-800 ring-emerald-200">
                        {typeof b.aantal === "number" ? `${b.aantal} gevonden` : "live"}
                      </span>
                    ) : (
                      <span className="badge bg-slate-200 text-slate-600 ring-slate-300">handmatig</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{b.bron}</div>
                  <p className="mt-2 text-sm text-slate-700">{b.samenvatting}</p>
                  {b.url && (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-medium text-hanab-700 hover:underline"
                    >
                      Bron / loket ↗
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* AI-rapport */}
            {bo.rapport && (
              <div className="p-6">
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="font-semibold">Rapport</h3>
                  <span className="badge bg-amber-100 text-amber-800 ring-amber-200">
                    {bo.bron === "claude" ? "Claude" : "lokale regels"}
                  </span>
                </div>
                <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">
                  {bo.rapport}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

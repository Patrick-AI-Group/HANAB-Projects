import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SubmitKnop } from "@/components/SubmitKnop";
import {
  TEKENING_DISCIPLINE,
  TEKENING_STATUS,
  TEKENING_STATUS_KLEUR,
  labelTekeningDiscipline,
  labelTekeningStatus,
  type TekeningStatus,
} from "@/lib/domein";
import {
  genereerWerktekeningen,
  voegWerktekeningToe,
  verwijderWerktekening,
  wijzigWerktekeningStatus,
} from "@/app/actions";

export const dynamic = "force-dynamic";
// AI-acties (Claude) duren ~20-40s; verhoog de serverless-timeout zodat Vercel
// de functie niet na de standaard 10s afkapt (max 60s op Hobby, 300s op Pro).
export const maxDuration = 60;

export default async function ProjectWerktekeningen({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      werktekeningen: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) notFound();

  return (
    <div className="space-y-6">
      {/* Werktekeningen */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Werktekeningen</h2>
            <p className="text-xs text-slate-500">Maken en monitoren · AI bepaalt benodigde tekeningen</p>
          </div>
          <form action={genereerWerktekeningen}>
            <input type="hidden" name="projectId" value={project.id} />
            <SubmitKnop title="Laat AI de benodigde werktekeningen bepalen" bezigLabel="AI bepaalt…">
              ✨ AI-tekeningadvies
            </SubmitKnop>
          </form>
        </div>

        {project.werktekeningen.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Nog geen werktekeningen. Klik op <strong>AI-tekeningadvies</strong> voor een lijst
            benodigde tekeningen, of voeg hieronder handmatig toe.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {project.werktekeningen.map((t) => (
              <div key={t.id} className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.titel}</span>
                    <span className="badge bg-slate-100 text-slate-600 ring-slate-200">
                      {labelTekeningDiscipline(t.discipline)}
                    </span>
                    <span className="text-xs text-slate-400">v{t.versie}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {t.tekeningnummer ? `${t.tekeningnummer} · ` : ""}
                    {t.tekenaar ? `tekenaar: ${t.tekenaar}` : "nog geen tekenaar"}
                    {t.pad && (
                      <>
                        {" · "}
                        <a href={t.pad} target="_blank" rel="noreferrer" className="font-medium text-hanab-700 hover:underline">
                          tekening openen ↗
                        </a>
                      </>
                    )}
                  </div>
                  {t.aiRationale && (
                    <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-100">
                      <span className="font-semibold">AI: </span>
                      {t.aiRationale}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${TEKENING_STATUS_KLEUR[t.status as TekeningStatus] ?? ""}`}>
                    {labelTekeningStatus(t.status)}
                  </span>
                  <form action={wijzigWerktekeningStatus} className="flex items-center gap-1">
                    <input type="hidden" name="tekeningId" value={t.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <select name="status" defaultValue={t.status} className="input w-36 py-1.5 text-xs">
                      {Object.entries(TEKENING_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <button className="btn-ghost px-2 py-1.5 text-xs" type="submit">
                      Opslaan
                    </button>
                  </form>
                  <form action={verwijderWerktekening}>
                    <input type="hidden" name="tekeningId" value={t.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button
                      className="btn-ghost px-2 py-1.5 text-xs text-rose-600 ring-rose-200 hover:bg-rose-50"
                      title="Verwijderen"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <form action={voegWerktekeningToe} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="flex-1 min-w-[12rem]">
              <label className="label text-xs">Titel</label>
              <input name="titel" required className="input py-1.5 text-sm" placeholder="bv. Tracétekening" />
            </div>
            <div className="w-40">
              <label className="label text-xs">Discipline</label>
              <select name="discipline" className="input py-1.5 text-sm" defaultValue="TRACE">
                {Object.entries(TEKENING_DISCIPLINE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="label text-xs">Tek.nummer</label>
              <input name="tekeningnummer" className="input py-1.5 text-sm" placeholder="optioneel" />
            </div>
            <div className="w-20">
              <label className="label text-xs">Versie</label>
              <input name="versie" className="input py-1.5 text-sm" defaultValue="A" />
            </div>
            <div className="w-36">
              <label className="label text-xs">Tekenaar</label>
              <input name="tekenaar" className="input py-1.5 text-sm" placeholder="optioneel" />
            </div>
            <button className="btn-primary" type="submit">
              Toevoegen
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

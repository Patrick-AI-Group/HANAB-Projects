import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SubmitKnop } from "@/components/SubmitKnop";
import { EENHEDEN, MBB_STATUS, MBB_STATUS_KLEUR, type MbbStatus } from "@/lib/domein";
import { genereerMBB, voegMateriaalToe, verwijderMateriaal, wijzigMateriaalStatus } from "@/app/actions";

export const dynamic = "force-dynamic";
// AI-acties (Claude) duren ~20-40s; verhoog de serverless-timeout zodat Vercel
// de functie niet na de standaard 10s afkapt (max 60s op Hobby, 300s op Pro).
export const maxDuration = 60;

export default async function ProjectMateriaal({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      materiaalRegels: { orderBy: { createdAt: "asc" } },
      vocaRegels: { select: { categorie: true } },
    },
  });
  if (!project) notFound();

  return (
    <div className="space-y-6">
      {/* Materiaalbestellingen (MBB) */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Materiaalbestellingen (MBB)</h2>
            <p className="text-xs text-slate-500">
              Te bestellen materialen
              {project.vocaRegels.some((r) => r.categorie === "MATERIAAL")
                ? " · afleidbaar uit de voorcalculatie"
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {project.materiaalRegels.length > 0 && (
              <>
                <a
                  href={`/api/export/mbb?projectId=${project.id}&format=xlsx`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                  title="Exporteer naar Excel"
                >
                  ⬇ Excel
                </a>
                <a
                  href={`/api/export/mbb?projectId=${project.id}&format=pdf`}
                  className="btn-ghost px-3 py-1.5 text-xs"
                  title="Exporteer naar PDF"
                >
                  ⬇ PDF
                </a>
              </>
            )}
            <form action={genereerMBB}>
              <input type="hidden" name="projectId" value={project.id} />
              <SubmitKnop title="Stel materiaalbestellingenbestand samen" bezigLabel="AI stelt samen…">
                ✨ MBB samenstellen
              </SubmitKnop>
            </form>
          </div>
        </div>

        {project.materiaalRegels.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Nog geen materialen. Klik op <strong>MBB samenstellen</strong> — als er een
            voorcalculatie is, worden de materiaalregels daaruit overgenomen.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-2.5 font-medium">Artikel</th>
                  <th className="px-3 py-2.5 text-right font-medium">Hoev.</th>
                  <th className="px-3 py-2.5 font-medium">Eenh.</th>
                  <th className="px-3 py-2.5 font-medium">Leverancier</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {project.materiaalRegels.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-6 py-2.5">
                      {m.artikel}
                      {m.bron && m.bron !== "HANDMATIG" && (
                        <span className="ml-2 align-middle text-[10px] font-medium text-hanab-accent">
                          {m.bron}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.hoeveelheid}</td>
                    <td className="px-3 py-2.5 text-slate-600">{m.eenheid}</td>
                    <td className="px-3 py-2.5 text-slate-600">{m.leverancier ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <form action={wijzigMateriaalStatus} className="flex items-center gap-1">
                        <input type="hidden" name="regelId" value={m.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <select
                          name="status"
                          defaultValue={m.status}
                          className={`badge border-0 ${MBB_STATUS_KLEUR[m.status as MbbStatus] ?? ""}`}
                        >
                          {Object.entries(MBB_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <button className="btn-ghost px-2 py-1 text-xs" type="submit">
                          OK
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <form action={verwijderMateriaal}>
                        <input type="hidden" name="regelId" value={m.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <button className="text-rose-500 hover:text-rose-700" title="Verwijderen">
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <form action={voegMateriaalToe} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="flex-1 min-w-[14rem]">
              <label className="label text-xs">Artikel</label>
              <input name="artikel" required className="input py-1.5 text-sm" placeholder="bv. PE100 Ø110 SDR17" />
            </div>
            <div className="w-24">
              <label className="label text-xs">Hoev.</label>
              <input name="hoeveelheid" type="number" step="any" className="input py-1.5 text-sm" defaultValue="1" />
            </div>
            <div className="w-24">
              <label className="label text-xs">Eenheid</label>
              <select name="eenheid" className="input py-1.5 text-sm" defaultValue="m1">
                {EENHEDEN.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-40">
              <label className="label text-xs">Leverancier</label>
              <input name="leverancier" className="input py-1.5 text-sm" placeholder="optioneel" />
            </div>
            <button className="btn-primary" type="submit">
              + Artikel
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

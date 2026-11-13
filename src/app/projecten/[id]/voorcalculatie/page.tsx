import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SubmitKnop } from "@/components/SubmitKnop";
import { EENHEDEN, VOCA_CATEGORIE, euro, labelVocaCategorie } from "@/lib/domein";
import { genereerVoca, voegVocaRegelToe, verwijderVocaRegel } from "@/app/actions";

export const dynamic = "force-dynamic";
// AI-acties (Claude) duren ~20-40s; verhoog de serverless-timeout zodat Vercel
// de functie niet na de standaard 10s afkapt (max 60s op Hobby, 300s op Pro).
export const maxDuration = 60;

export default async function ProjectVoorcalculatie({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      vocaRegels: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) notFound();

  const vocaTotaal = project.vocaRegels.reduce((s, r) => s + r.hoeveelheid * r.eenheidsprijs, 0);

  return (
    <div className="space-y-6">
      {/* Voorcalculatie (VOCA) */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Voorcalculatie (VOCA)</h2>
            <p className="text-xs text-slate-500">Begroting op basis van de projectscope</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-500">Raming totaal</div>
              <div className="text-lg font-bold text-hanab-900">{euro(vocaTotaal)}</div>
            </div>
            {project.vocaRegels.length > 0 && (
              <div className="flex items-center gap-2">
                <a href={`/api/export/voca?projectId=${project.id}&format=xlsx`} className="btn-ghost px-3 py-1.5 text-xs" title="Exporteer naar Excel">
                  ⬇ Excel
                </a>
                <a href={`/api/export/voca?projectId=${project.id}&format=pdf`} className="btn-ghost px-3 py-1.5 text-xs" title="Exporteer naar PDF">
                  ⬇ PDF
                </a>
              </div>
            )}
            <form action={genereerVoca}>
              <input type="hidden" name="projectId" value={project.id} />
              <SubmitKnop title="Genereer voorcalculatie met AI" bezigLabel="AI rekent…">
                ✨ AI-voorcalculatie
              </SubmitKnop>
            </form>
          </div>
        </div>

        {project.vocaRegels.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Nog geen voorcalculatie. Klik op <strong>AI-voorcalculatie</strong> om op basis van de
            scope een begroting te genereren.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-2.5 font-medium">Omschrijving</th>
                  <th className="px-3 py-2.5 font-medium">Categorie</th>
                  <th className="px-3 py-2.5 text-right font-medium">Hoev.</th>
                  <th className="px-3 py-2.5 font-medium">Eenh.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Prijs/eenh.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Bedrag</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {project.vocaRegels.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-6 py-2.5">
                      {r.omschrijving}
                      {r.aiGegenereerd && (
                        <span className="ml-2 align-middle text-[10px] font-medium text-hanab-accent">AI</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{labelVocaCategorie(r.categorie)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.hoeveelheid}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.eenheid}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{euro(r.eenheidsprijs)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {euro(r.hoeveelheid * r.eenheidsprijs)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <form action={verwijderVocaRegel}>
                        <input type="hidden" name="regelId" value={r.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <button className="text-rose-500 hover:text-rose-700" title="Verwijderen">
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-6 py-3 font-semibold" colSpan={5}>
                    Totaal (excl. btw)
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">{euro(vocaTotaal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <form action={voegVocaRegelToe} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="flex-1 min-w-[14rem]">
              <label className="label text-xs">Omschrijving</label>
              <input name="omschrijving" required className="input py-1.5 text-sm" placeholder="bv. Levering PE-leiding" />
            </div>
            <div className="w-44">
              <label className="label text-xs">Categorie</label>
              <select name="categorie" className="input py-1.5 text-sm" defaultValue="MATERIAAL">
                {Object.entries(VOCA_CATEGORIE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
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
            <div className="w-28">
              <label className="label text-xs">Prijs/eenh.</label>
              <input name="eenheidsprijs" type="number" step="any" className="input py-1.5 text-sm" defaultValue="0" />
            </div>
            <button className="btn-primary" type="submit">
              + Regel
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

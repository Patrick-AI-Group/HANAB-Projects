import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SubmitKnop } from "@/components/SubmitKnop";
import {
  DEELBETALING_STATUS,
  DEELBETALING_STATUS_KLEUR,
  euro,
  type DeelbetalingStatus,
} from "@/lib/domein";
import {
  genereerDeelbetaling,
  verwijderDeelbetaling,
  voegDeelbetalingToe,
  wijzigDeelbetalingStatus,
} from "@/app/actions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("nl-NL") : "—";
}

export default async function ProjectAfrekening({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      weekproducties: { include: { regels: true } },
      deelbetalingen: { orderBy: { termijn: "asc" } },
    },
  });
  if (!project) notFound();

  const alleRegels = project.weekproducties.flatMap((w) => w.regels);
  const gerealiseerdTotaal = alleRegels.reduce((s, r) => s + r.gerealiseerd * r.eenheidsprijs, 0);
  const gefactureerd = project.deelbetalingen.reduce((s, d) => s + d.bedrag, 0);
  const openstaand = Math.max(0, gerealiseerdTotaal - gefactureerd);

  return (
    <div className="space-y-6">
      {/* Deelbetalingen */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Deelbetalingen (termijnstaat)</h2>
            <p className="text-xs text-slate-500">
              Termijnbedrag wordt berekend uit de gerealiseerde productie minus eerder gefactureerd
            </p>
          </div>
          <form action={genereerDeelbetaling}>
            <input type="hidden" name="projectId" value={project.id} />
            <SubmitKnop title="Bereken nieuwe termijn uit gerealiseerde productie" bezigLabel="Bezig…">
              + Genereer termijn
            </SubmitKnop>
          </form>
        </div>

        <div className="grid grid-cols-3 gap-3 px-6 py-4">
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Gerealiseerde productie</div>
            <div className="text-lg font-semibold tabular-nums">{euro(gerealiseerdTotaal)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Reeds gefactureerd</div>
            <div className="text-lg font-semibold tabular-nums">{euro(gefactureerd)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Nog te factureren</div>
            <div className={`text-lg font-semibold tabular-nums ${openstaand > 0 ? "text-hanab-accent" : ""}`}>
              {euro(openstaand)}
            </div>
          </div>
        </div>

        {project.deelbetalingen.length > 0 && (
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-2.5 font-medium">Termijn</th>
                  <th className="px-3 py-2.5 font-medium">Datum</th>
                  <th className="px-3 py-2.5 font-medium">Omschrijving</th>
                  <th className="px-3 py-2.5 text-right font-medium">Bedrag</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Afrekenstaat</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {project.deelbetalingen.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-6 py-2.5 font-medium">T{d.termijn}</td>
                    <td className="px-3 py-2.5 text-slate-600">{fmt(d.datum)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{d.omschrijving ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{euro(d.bedrag)}</td>
                    <td className="px-3 py-2.5">
                      <form action={wijzigDeelbetalingStatus} className="flex items-center gap-1">
                        <input type="hidden" name="deelbetalingId" value={d.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <select
                          name="status"
                          defaultValue={d.status}
                          className={`badge border-0 ${DEELBETALING_STATUS_KLEUR[d.status as DeelbetalingStatus] ?? ""}`}
                        >
                          {Object.entries(DEELBETALING_STATUS).map(([k, v]) => (
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
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/export/deelafrekening?deelbetalingId=${d.id}&format=pdf`}
                          className="btn-ghost px-2 py-1 text-xs"
                          title="Deelafrekenstaat als PDF"
                        >
                          ⬇ PDF
                        </a>
                        <a
                          href={`/api/export/deelafrekening?deelbetalingId=${d.id}&format=xlsx`}
                          className="btn-ghost px-2 py-1 text-xs"
                          title="Deelafrekenstaat als Excel"
                        >
                          ⬇ Excel
                        </a>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <form action={verwijderDeelbetaling}>
                        <input type="hidden" name="deelbetalingId" value={d.id} />
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

        {/* Handmatige termijn */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <form action={voegDeelbetalingToe} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="flex-1 min-w-[12rem]">
              <label className="label text-xs">Omschrijving</label>
              <input name="omschrijving" className="input py-1.5 text-sm" placeholder="handmatige termijn" />
            </div>
            <div className="w-40">
              <label className="label text-xs">Datum</label>
              <input name="datum" type="date" className="input py-1.5 text-sm" />
            </div>
            <div className="w-32">
              <label className="label text-xs">Bedrag (€)</label>
              <input name="bedrag" type="number" step="any" className="input py-1.5 text-sm" defaultValue="0" />
            </div>
            <button className="btn-primary" type="submit">
              + Termijn
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

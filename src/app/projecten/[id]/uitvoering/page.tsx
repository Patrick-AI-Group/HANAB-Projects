import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SubmitKnop } from "@/components/SubmitKnop";
import {
  DEELBETALING_STATUS,
  DEELBETALING_STATUS_KLEUR,
  DEELREVISIE_STATUS,
  DEELREVISIE_STATUS_KLEUR,
  EENHEDEN,
  WEEKPRODUCTIE_STATUS,
  euro,
  labelDeelbetalingStatus,
  labelDeelrevisieStatus,
  labelWeekproductieStatus,
  type DeelbetalingStatus,
  type DeelrevisieStatus,
} from "@/lib/domein";
import {
  genereerDeelbetaling,
  genereerDeelrevisies,
  maakWeekproductie,
  updateRealisatie,
  voegDeelbetalingToe,
  voegDeelrevisieToe,
  voegWeekproductieRegelToe,
  verwijderDeelbetaling,
  verwijderDeelrevisie,
  verwijderWeekproductie,
  wijzigDeelbetalingStatus,
  wijzigDeelrevisieStatus,
  wijzigWeekproductieStatus,
} from "@/app/actions";

export const dynamic = "force-dynamic";
// AI-acties (Claude) kunnen ~20-40s duren; verhoog de serverless-timeout.
export const maxDuration = 60;

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("nl-NL") : "—";
}

export default async function ProjectUitvoering({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      weekproducties: { orderBy: [{ jaar: "asc" }, { week: "asc" }], include: { regels: { orderBy: { id: "asc" } } } },
      deelbetalingen: { orderBy: { termijn: "asc" } },
      deelrevisies: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) notFound();

  const alleRegels = project.weekproducties.flatMap((w) => w.regels);
  const gerealiseerdTotaal = alleRegels.reduce((s, r) => s + r.gerealiseerd * r.eenheidsprijs, 0);
  const gefactureerd = project.deelbetalingen.reduce((s, d) => s + d.bedrag, 0);
  const openstaand = Math.max(0, gerealiseerdTotaal - gefactureerd);

  return (
    <div className="space-y-6">
      {/* Weekproducties */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Weekproducties</h2>
            <p className="text-xs text-slate-500">
              Geregistreerde productie per week · regels automatisch voorgevuld uit de voorcalculatie
            </p>
          </div>
          <form action={maakWeekproductie}>
            <input type="hidden" name="projectId" value={project.id} />
            <SubmitKnop title="Nieuwe weekproductie (huidige week, voorgevuld uit VOCA)" bezigLabel="Bezig…">
              + Nieuwe weekproductie
            </SubmitKnop>
          </form>
        </div>

        {project.weekproducties.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Nog geen weekproducties. Klik op <strong>Nieuwe weekproductie</strong> — de productieregels
            worden voorgevuld vanuit de voorcalculatie, je vult alleen de gerealiseerde hoeveelheden in.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {project.weekproducties.map((w) => {
              const weekTotaal = w.regels.reduce((s, r) => s + r.gerealiseerd * r.eenheidsprijs, 0);
              return (
                <div key={w.id} className="px-6 py-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">
                        Week {w.jaar}-W{String(w.week).padStart(2, "0")}
                      </span>
                      <span className="text-sm text-slate-500">
                        productie {euro(weekTotaal)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={wijzigWeekproductieStatus} className="flex items-center gap-1">
                        <input type="hidden" name="weekproductieId" value={w.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <select name="status" defaultValue={w.status} className="input w-36 py-1.5 text-xs">
                          {Object.entries(WEEKPRODUCTIE_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <button className="btn-ghost px-2 py-1.5 text-xs" type="submit">
                          Status
                        </button>
                      </form>
                      <form action={verwijderWeekproductie}>
                        <input type="hidden" name="weekproductieId" value={w.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <button className="btn-ghost px-2 py-1.5 text-xs text-rose-600 ring-rose-200 hover:bg-rose-50" title="Week verwijderen">
                          ✕
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2 font-medium">Post</th>
                          <th className="px-3 py-2 text-right font-medium">Gepland</th>
                          <th className="px-3 py-2 text-right font-medium">Gerealiseerd</th>
                          <th className="px-3 py-2 font-medium">Eenh.</th>
                          <th className="px-3 py-2 text-right font-medium">Prijs</th>
                          <th className="px-3 py-2 text-right font-medium">Productie</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {w.regels.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-3 text-center text-xs text-slate-400">
                              Geen regels — voeg hieronder een post toe.
                            </td>
                          </tr>
                        ) : (
                          w.regels.map((r) => (
                            <tr key={r.id}>
                              <td className="px-4 py-2">{r.omschrijving}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.gepland}</td>
                              <td className="px-3 py-2 text-right">
                                <form action={updateRealisatie} className="flex items-center justify-end gap-1">
                                  <input type="hidden" name="regelId" value={r.id} />
                                  <input type="hidden" name="projectId" value={project.id} />
                                  <input
                                    name="gerealiseerd"
                                    type="number"
                                    step="any"
                                    defaultValue={r.gerealiseerd}
                                    className="input w-24 py-1 text-right text-sm"
                                  />
                                  <button className="btn-ghost px-2 py-1 text-xs" type="submit">
                                    ✓
                                  </button>
                                </form>
                              </td>
                              <td className="px-3 py-2 text-slate-600">{r.eenheid}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{euro(r.eenheidsprijs)}</td>
                              <td className="px-3 py-2 text-right font-medium tabular-nums">
                                {euro(r.gerealiseerd * r.eenheidsprijs)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Post handmatig toevoegen */}
                  <form action={voegWeekproductieRegelToe} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="weekproductieId" value={w.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <input name="omschrijving" required placeholder="post" className="input w-56 py-1.5 text-sm" />
                    <input name="gepland" type="number" step="any" placeholder="gepland" className="input w-24 py-1.5 text-sm" defaultValue="0" />
                    <input name="gerealiseerd" type="number" step="any" placeholder="gereal." className="input w-24 py-1.5 text-sm" defaultValue="0" />
                    <select name="eenheid" className="input w-20 py-1.5 text-sm" defaultValue="m1">
                      {EENHEDEN.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                    <input name="eenheidsprijs" type="number" step="any" placeholder="prijs" className="input w-24 py-1.5 text-sm" defaultValue="0" />
                    <button className="btn-ghost px-3 py-1.5 text-xs" type="submit">
                      + Post
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>

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

      {/* Deelrevisies */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Deelrevisies</h2>
            <p className="text-xs text-slate-500">Revisie (as-built) per deel · AI adviseert de benodigde delen</p>
          </div>
          <form action={genereerDeelrevisies}>
            <input type="hidden" name="projectId" value={project.id} />
            <SubmitKnop title="Laat AI de benodigde deelrevisies bepalen" bezigLabel="AI bepaalt…">
              ✨ AI-revisieadvies
            </SubmitKnop>
          </form>
        </div>

        {project.deelrevisies.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Nog geen deelrevisies. Klik op <strong>AI-revisieadvies</strong> of voeg hieronder handmatig toe.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {project.deelrevisies.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <span className="font-medium">{r.deel}</span>
                  {r.omschrijving && <div className="mt-0.5 text-xs text-slate-500">{r.omschrijving}</div>}
                  {r.aiRationale && (
                    <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-100">
                      <span className="font-semibold">AI: </span>
                      {r.aiRationale}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${DEELREVISIE_STATUS_KLEUR[r.status as DeelrevisieStatus] ?? ""}`}>
                    {labelDeelrevisieStatus(r.status)}
                  </span>
                  <form action={wijzigDeelrevisieStatus} className="flex items-center gap-1">
                    <input type="hidden" name="revisieId" value={r.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <select name="status" defaultValue={r.status} className="input w-36 py-1.5 text-xs">
                      {Object.entries(DEELREVISIE_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <button className="btn-ghost px-2 py-1.5 text-xs" type="submit">
                      Opslaan
                    </button>
                  </form>
                  <form action={verwijderDeelrevisie}>
                    <input type="hidden" name="revisieId" value={r.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button className="btn-ghost px-2 py-1.5 text-xs text-rose-600 ring-rose-200 hover:bg-rose-50" title="Verwijderen">
                      ✕
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <form action={voegDeelrevisieToe} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="w-56">
              <label className="label text-xs">Deel / fase</label>
              <input name="deel" required className="input py-1.5 text-sm" placeholder="bv. Tracé as-built" />
            </div>
            <div className="flex-1 min-w-[12rem]">
              <label className="label text-xs">Omschrijving</label>
              <input name="omschrijving" className="input py-1.5 text-sm" placeholder="optioneel" />
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

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { OnderzoekStatusBadge } from "@/components/Badges";
import {
  EENHEDEN,
  MBB_STATUS,
  MBB_STATUS_KLEUR,
  ONDERZOEK_STATUS,
  ONDERZOEK_TYPES,
  TEKENING_DISCIPLINE,
  TEKENING_STATUS,
  TEKENING_STATUS_KLEUR,
  VOCA_CATEGORIE,
  euro,
  labelDocumentCategorie,
  labelOnderzoek,
  labelTekeningDiscipline,
  labelTekeningStatus,
  labelVocaCategorie,
  type MbbStatus,
  type TekeningStatus,
} from "@/lib/domein";
import {
  genereerMBB,
  genereerMonitoring,
  genereerOnderzoeksadvies,
  genereerOnderzoekRapport,
  genereerVoca,
  genereerWerktekeningen,
  genereerDossierDocumentenAction,
  voegMateriaalToe,
  voegOnderzoekToe,
  voegVocaRegelToe,
  voegWerktekeningToe,
  verwijderMateriaal,
  verwijderOnderzoek,
  verwijderVocaRegel,
  verwijderWerktekening,
  wijzigMateriaalStatus,
  wijzigOnderzoekStatus,
  wijzigWerktekeningStatus,
} from "@/app/actions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("nl-NL") : "—";
}
function fmtTijd(d: Date) {
  return d.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export default async function ProjectIntake({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      onderzoeken: { orderBy: { createdAt: "asc" } },
      vocaRegels: { orderBy: { createdAt: "asc" } },
      materiaalRegels: { orderBy: { createdAt: "asc" } },
      werktekeningen: { orderBy: { createdAt: "asc" } },
      documenten: { orderBy: { naam: "asc" } },
      activiteiten: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  });
  if (!project) notFound();

  const vocaTotaal = project.vocaRegels.reduce((s, r) => s + r.hoeveelheid * r.eenheidsprijs, 0);
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
              <button className="btn-accent" type="submit" title="Laat AI benodigde onderzoeken adviseren">
                ✨ AI-onderzoeksadvies
              </button>
            </form>
            <form action={genereerMonitoring}>
              <input type="hidden" name="projectId" value={project.id} />
              <button className="btn-ghost" type="submit" title="AI-duiding op voortgang en risico's">
                AI-monitoring
              </button>
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
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <form action={genereerOnderzoekRapport}>
                        <input type="hidden" name="onderzoekId" value={o.id} />
                        <button className="btn-ghost px-2.5 py-1 text-xs" type="submit">
                          ✨ {o.rapport ? "Rapport opnieuw genereren" : "Genereer AI-rapport"}
                        </button>
                      </form>
                      {o.rapportPad && (
                        <a
                          href={o.rapportPad}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-hanab-700 hover:underline"
                        >
                          rapport openen ↗
                        </a>
                      )}
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
              <button className="btn-accent" type="submit" title="Genereer voorcalculatie met AI">
                ✨ AI-voorcalculatie
              </button>
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
              <button className="btn-accent" type="submit" title="Stel materiaalbestellingenbestand samen">
                ✨ MBB samenstellen
              </button>
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

      {/* Werktekeningen */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Werktekeningen</h2>
            <p className="text-xs text-slate-500">Maken en monitoren · AI bepaalt benodigde tekeningen</p>
          </div>
          <form action={genereerWerktekeningen}>
            <input type="hidden" name="projectId" value={project.id} />
            <button className="btn-accent" type="submit" title="Laat AI de benodigde werktekeningen bepalen">
              ✨ AI-tekeningadvies
            </button>
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
            <button className="btn-accent" type="submit" title="Genereer/ververs alle dossierdocumenten">
              📄 Genereer dossierdocumenten
            </button>
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

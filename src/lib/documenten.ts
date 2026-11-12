// Genereert dossierstukken (HTML, printbaar + CSV) uit een volledig geladen
// project. Server-only. Volledig lokaal — geen externe assets in de HTML.
// Elk stuk heeft een huisstijlkop, KPI-kaarten en passende visualisaties.

import {
  euro,
  labelProjectType,
  labelProjectStatus,
  labelOnderzoek,
  labelOnderzoekStatus,
  labelVocaCategorie,
  labelMbbStatus,
  labelTekeningDiscipline,
  labelTekeningStatus,
  labelDeelbetalingStatus,
  labelDeelrevisieStatus,
  onderzoekGereed,
  onderzoekLoopt,
  PROJECT_STATUS_VOLGORDE,
} from "./domein";
import { aanbevolenOnderzoekRijen } from "./ai";
import {
  RAPPORT_CSS,
  CAT,
  kpiKaarten,
  donut,
  staven,
  kolommen,
  voortgang,
  statusBalk,
  tijdlijn,
  type Kpi,
  type Deel,
} from "./rapport-ui";

export interface DossierExtra {
  kaartjeSvg?: string;
  tekeningen?: { titel: string; svg: string }[];
  lengteM?: number;
}

export interface DossierStuk {
  categorie: string;
  naam: string;
  bestandsnaam: string;
  inhoud: string;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function dstr(d: Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("nl-NL") : "—";
}

// --- Gedeelde berekeningen --------------------------------------------------

function vocaTotaal(p: any): number {
  return (p.vocaRegels ?? []).reduce((s: number, r: any) => s + r.hoeveelheid * r.eenheidsprijs, 0);
}
function vocaPerCategorie(p: any): Deel[] {
  const m = new Map<string, number>();
  for (const r of p.vocaRegels ?? []) {
    m.set(r.categorie, (m.get(r.categorie) ?? 0) + r.hoeveelheid * r.eenheidsprijs);
  }
  return [...m.entries()]
    .map(([c, v]) => ({ label: labelVocaCategorie(c), waarde: v }))
    .sort((a, b) => b.waarde - a.waarde);
}
function weekBedrag(w: any): number {
  return (w.regels ?? []).reduce((s: number, r: any) => s + r.gerealiseerd * r.eenheidsprijs, 0);
}
function gerealiseerdTotaal(p: any): number {
  return (p.weekproducties ?? []).reduce((s: number, w: any) => s + weekBedrag(w), 0);
}
function bevindingenVan(p: any): any[] {
  try {
    return p.bureauonderzoek?.bevindingenJson ? JSON.parse(p.bureauonderzoek.bevindingenJson) : [];
  } catch {
    return [];
  }
}

// --- Documentomhulsel -------------------------------------------------------

function wrap(titel: string, p: any, body: string, datum: string, opts: { soort?: string; intro?: string } = {}): string {
  const soort = opts.soort ?? "Dossierstuk";
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.projectnummer)} — ${esc(titel)}</title>
<style>
  :root{--navy:#00214b;--navy2:#00416e;--accent:#e63223;--grid:#e2e8f0;--muted:#64748b}
  *{box-sizing:border-box}
  body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:0;background:#eef2f7}
  .page{max-width:960px;margin:24px auto;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.08)}
  header{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;padding:22px 32px;border-bottom:4px solid var(--accent);position:relative;overflow:hidden}
  header::after{content:"";position:absolute;right:-60px;top:-60px;width:240px;height:240px;border-radius:50%;background:rgba(255,255,255,.04)}
  header .merk{font-weight:800;font-size:20px;letter-spacing:-.3px}
  header .merk span{color:var(--accent)}
  header .soort{display:inline-block;margin-top:12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;background:var(--accent);padding:3px 10px;border-radius:999px}
  header h1{font-size:21px;margin:8px 0 4px;letter-spacing:-.3px}
  header .meta{font-size:12px;color:#c7d3e2}
  main{padding:26px 32px}
  .intro{color:#475569;font-size:13.5px;margin:0 0 18px;max-width:72ch}
  h2{font-size:15px;color:var(--navy);border-bottom:2px solid var(--grid);padding-bottom:5px;margin:24px 0 12px}
  h2:first-child{margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
  th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #e9eef4}
  th{background:#f3f6fa;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  tbody tr:nth-child(even){background:#fafbfd}
  tfoot td{font-weight:700;border-top:2px solid var(--navy);background:#f3f6fa}
  .badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:#e8eef6;color:#1e3a5f;font-weight:600}
  .badge-ok{background:#dcfce7;color:#166534}
  .badge-warn{background:#fef3c7;color:#92400e}
  .muted{color:#64748b}
  .pre{white-space:pre-wrap;background:#f8fafc;border:1px solid var(--grid);border-left:3px solid var(--navy2);border-radius:8px;padding:16px 18px;font-size:13px;line-height:1.65}
  .rap p{margin:9px 0;color:#334155;font-size:13.5px;line-height:1.68}
  .rap ul{list-style:none;margin:8px 0 12px;padding:0}
  .rap ul li{position:relative;padding:4px 0 4px 20px;color:#334155;font-size:13.5px;line-height:1.55}
  .rap ul li::before{content:"";position:absolute;left:3px;top:11px;width:6px;height:6px;border-radius:50%;background:var(--accent)}
  .rap h2{font-size:15px;color:var(--navy);border-bottom:2px solid var(--grid);padding-bottom:5px;margin:22px 0 10px}
  .rap h2 .nr{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--navy);color:#fff;font-size:11px;font-weight:800;margin-right:9px;vertical-align:middle}
  footer{padding:16px 32px;color:#94a3b8;font-size:11px;border-top:1px solid var(--grid);display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px}
  a{color:var(--navy2)}
  figure{margin:0}
  figure svg,.tek svg{max-width:100%;height:auto;display:block}
  .tek{border:1px solid var(--grid);border-radius:8px;overflow:hidden;margin:10px 0}
  .kaart-fig{margin:0 0 18px;border:1px solid var(--grid);border-radius:12px;overflow:hidden}
  .kaart-fig figcaption{font-size:11px;color:var(--muted);padding:8px 12px;background:#f8fafc;border-top:1px solid var(--grid)}
  .inhoud{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  @media (max-width:680px){.inhoud{grid-template-columns:1fr}}
  .inhoud li a{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--grid);border-radius:9px;text-decoration:none;color:var(--navy);font-size:13px;font-weight:600;background:#fff}
  .inhoud li a:hover{border-color:var(--navy2);background:#f8fafc}
  .inhoud .nr{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;background:var(--navy);color:#fff;font-size:11px;font-weight:800;flex:0 0 auto}
  ${RAPPORT_CSS}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none}header::after{display:none}}
</style></head><body><div class="page">
<header>
  <div class="merk">Hanab<span>.</span> BMS</div>
  <div class="soort">${esc(soort)}</div>
  <h1>${esc(titel)}</h1>
  <div class="meta">${esc(p.projectnummer)} · ${esc(p.naam)} · ${esc(p.opdrachtgever)} · ${esc(labelProjectType(p.type))}${p.plaats ? " · " + esc(p.plaats) : ""} · opgesteld ${esc(datum)}</div>
</header>
<main>${opts.intro ? `<p class="intro">${esc(opts.intro)}</p>` : ""}${body}</main>
<footer><span>HANAB BMS — automatisch gegenereerd dossierstuk · ondergrondse infra: kabels elektra &amp; leidingen water.</span><span>${esc(p.projectnummer)} · ${esc(datum)}</span></footer>
</div></body></html>`;
}

function kaartFiguur(kaartjeSvg: string | undefined, caption: string): string {
  if (!kaartjeSvg) return "";
  return `<figure class="kaart-fig">${kaartjeSvg}<figcaption>${esc(caption)}</figcaption></figure>`;
}

// --- Managementsamenvatting (cover) ----------------------------------------

function managementsamenvatting(
  p: any,
  datum: string,
  stukken: { naam: string; bestandsnaam: string }[],
  extra: DossierExtra
): string {
  const begroting = vocaTotaal(p);
  const gereal = gerealiseerdTotaal(p);
  const termijnen = p.deelbetalingen ?? [];
  const termijnTotaal = termijnen.reduce((s: number, t: any) => s + t.bedrag, 0);
  const betaald = termijnen.filter((t: any) => t.status === "BETAALD").reduce((s: number, t: any) => s + t.bedrag, 0);
  const onderzoeken = p.onderzoeken ?? [];
  const gereed = onderzoeken.filter((o: any) => onderzoekGereed(o.status)).length;
  const bev = bevindingenVan(p);
  const liveBronnen = bev.filter((b: any) => b.beschikbaar).length;

  // KPI-rij
  const kpis: Kpi[] = [
    { label: "Projectstatus", waarde: labelProjectStatus(p.status), sub: `${p.weekproducties?.length ?? 0} weekstaten`, icon: "◈" },
    { label: "Tracélengte", waarde: extra.lengteM ? `${Math.round(extra.lengteM)} m` : "—", sub: `${bev.length} open bronnen geraadpleegd`, icon: "↝" },
    { label: "Begroting (VOCA)", waarde: euro(begroting), sub: `${p.vocaRegels?.length ?? 0} posten`, accent: true, icon: "€" },
    { label: "Gerealiseerd", waarde: euro(gereal), sub: begroting ? `${Math.round((gereal / begroting) * 100)}% van begroting` : "—", icon: "▲" },
    { label: "Onderzoeken gereed", waarde: `${gereed}/${onderzoeken.length}`, sub: `${liveBronnen} live databronnen`, icon: "✓" },
    { label: "Materiaal (MBB)", waarde: String(p.materiaalRegels?.length ?? 0), sub: "artikelregels", icon: "▦" },
  ];

  // Tijdlijn projectfasen
  const idx = PROJECT_STATUS_VOLGORDE.indexOf(p.status);
  const afgerond = p.status === "AFGEROND";
  const fasen = PROJECT_STATUS_VOLGORDE.map((s, i) => ({
    titel: labelProjectStatus(s),
    klaar: afgerond || i < idx,
    actief: !afgerond && i === idx,
  }));

  // Grafieken
  const vocaDonut = donut("Begroting per categorie", vocaPerCategorie(p), { euro: true, totaalLabel: "VOCA" });
  const weekData = (p.weekproducties ?? []).map((w: any) => ({
    label: `W${String(w.week).padStart(2, "0")}`,
    waarde: weekBedrag(w),
  }));
  const weekChart = kolommen("Gerealiseerde productie per week", weekData, { euro: true, cumulatief: true });

  // Onderzoekstatus-verdeling
  const statusGroepen: Deel[] = [
    { label: "Gereed", waarde: onderzoeken.filter((o: any) => onderzoekGereed(o.status)).length, kleur: "#0f9d8c" },
    { label: "Loopt", waarde: onderzoeken.filter((o: any) => onderzoekLoopt(o.status)).length, kleur: "#f59e0b" },
    { label: "Open", waarde: onderzoeken.filter((o: any) => !onderzoekGereed(o.status) && !onderzoekLoopt(o.status)).length, kleur: "#94a3b8" },
  ];

  const voortgangen =
    voortgang("Uitbetaald t.o.v. termijnstaat", betaald, termijnTotaal || 1, { euro: true }) +
    voortgang("Conditionerende onderzoeken afgerond", gereed, onderzoeken.length || 1, { kleur: "#0f9d8c" }) +
    voortgang("Materiaal geleverd", (p.materiaalRegels ?? []).filter((m: any) => m.status === "GELEVERD").length, (p.materiaalRegels ?? []).length || 1, { kleur: "#00416e" });

  const inhoud = stukken
    .map(
      (s, i) =>
        `<li><a href="./${esc(s.bestandsnaam)}"><span class="nr">${String(i + 1).padStart(2, "0")}</span>${esc(s.naam)}</a></li>`
    )
    .join("");

  const body =
    kpiKaarten(kpis) +
    kaartFiguur(extra.kaartjeSvg, "Situatiekaart: ingetekend tracé (rood) op de OpenStreetMap-ondergrond — met noordpijl en schaalbalk.") +
    `<h2>Projectfasen</h2>` +
    tijdlijn(fasen) +
    `<h2>Financieel &amp; productie</h2>` +
    `<div class="grid2">${vocaDonut}${weekChart}</div>` +
    voortgangen +
    `<h2>Conditionerend onderzoek</h2>` +
    statusBalk("Status conditionerende onderzoeken", statusGroepen) +
    `<h2>Inhoud van dit dossier</h2>` +
    `<ol class="inhoud">${inhoud}</ol>`;

  return wrap("Managementsamenvatting projectdossier", p, body, datum, {
    soort: "Projectdossier",
    intro: `Geïntegreerd overzicht van het volledige projectdossier voor ${p.naam}. Deze samenvatting bundelt de kerncijfers, het ingetekende tracé, de financiële opbouw en de projectvoortgang; de onderliggende stukken zijn onderaan opgenomen.`,
  });
}

// --- Per dossierstuk --------------------------------------------------------

function bureauonderzoek(p: any, datum: string, kaartjeSvg?: string): string {
  const bo = p.bureauonderzoek;
  const arr = bevindingenVan(p);

  const kaart = kaartFiguur(kaartjeSvg, "Situatiekaart: ingetekend tracé (rood) waarlangs de open databronnen zijn bevraagd.");

  // KPI's + themagrafiek
  const live = arr.filter((b: any) => b.beschikbaar).length;
  const kpis: Kpi[] = [
    { label: "Geraadpleegde bronnen", waarde: String(arr.length), icon: "⛁" },
    { label: "Live databronnen", waarde: String(live), sub: `${arr.length - live} handmatig`, accent: true, icon: "◉" },
    { label: "Treffers totaal", waarde: String(arr.reduce((s: number, b: any) => s + (typeof b.aantal === "number" ? b.aantal : 0), 0)), sub: "objecten langs tracé", icon: "⚑" },
  ];
  const themaChart = staven(
    "Treffers per thema",
    arr.filter((b: any) => typeof b.aantal === "number").map((b: any) => ({ label: b.thema, waarde: b.aantal })),
    {}
  );

  const bron = arr.length
    ? `<h2>Geraadpleegde open bronnen langs het tracé</h2><table><thead><tr><th>Thema</th><th>Bron</th><th>Status</th><th class="num">Aantal</th><th>Bevinding</th></tr></thead><tbody>` +
      arr
        .map(
          (b: any) =>
            `<tr><td>${esc(b.thema)}</td><td>${esc(b.bron)}</td><td>${b.beschikbaar ? '<span class="badge badge-ok">live</span>' : '<span class="badge badge-warn">handmatig</span>'}</td><td class="num">${typeof b.aantal === "number" ? b.aantal : "—"}</td><td>${esc(b.samenvatting)}</td></tr>`
        )
        .join("") +
      `</tbody></table>`
    : "";
  const rap = bo?.rapport ? `<h2>Rapportage</h2><div class="pre">${esc(bo.rapport)}</div>` : "<p class='muted'>Nog geen rapport gegenereerd.</p>";
  let tabel = "";
  if (arr.length) {
    const rijen = aanbevolenOnderzoekRijen({ type: p.type, omschrijving: p.omschrijving }, arr)
      .map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`)
      .join("");
    tabel = `<h2>Aanbevolen vervolgonderzoek</h2><table><thead><tr><th>Onderzoek</th><th>Noodzaak</th><th>Doorlooptijd</th><th>Verantwoordelijke</th></tr></thead><tbody>${rijen}</tbody></table>`;
  }
  const visueel = arr.length ? kpiKaarten(kpis) + (themaChart ? `<div class="chart">${themaChart}</div>` : "") : "";
  return wrap("Bureauonderzoek conditionerende onderzoeken", p, kaart + visueel + bron + rap + tabel, datum, {
    soort: "Bureauonderzoek",
    intro: "Bureauonderzoek op basis van open databronnen (BRO, PDOK, Natura 2000) die langs het ingetekende tracé zijn bevraagd, met interpretatie en aanbevolen vervolgonderzoek.",
  });
}

/** HANAB-huisstijl HTML-rapport voor één conditionerend onderzoek. */
/** Zet de platte rapporttekst (genummerde HOOFDLETTER-koppen + '- ' bullets) om
 *  naar opgemaakte HTML met secties, lijsten en alinea's. */
function rapportTekstNaarHtml(tekst: string): string {
  const regels = tekst.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let inLijst = false;
  const sluit = () => {
    if (inLijst) {
      out.push("</ul>");
      inLijst = false;
    }
  };
  for (const ruw of regels) {
    const r = ruw.trim();
    if (!r) {
      sluit();
      continue;
    }
    // Sectiekop: "1. AANLEIDING EN DOEL" — genummerd + (nagenoeg) hoofdletters.
    const kop = r.match(/^(\d+)[.)]?\s+(.{3,})$/);
    if (kop && kop[2] === kop[2].toUpperCase() && /[A-ZÀ-Þ]/.test(kop[2])) {
      sluit();
      const titel = kop[2].charAt(0) + kop[2].slice(1).toLowerCase();
      out.push(`<h2><span class="nr">${esc(kop[1])}</span>${esc(titel)}</h2>`);
      continue;
    }
    // Opsomming.
    const bullet = r.match(/^[-•*]\s+(.*)$/);
    if (bullet) {
      if (!inLijst) {
        out.push("<ul>");
        inLijst = true;
      }
      out.push(`<li>${esc(bullet[1])}</li>`);
      continue;
    }
    sluit();
    out.push(`<p>${esc(r)}</p>`);
  }
  sluit();
  return `<div class="rap">${out.join("")}</div>`;
}

export function onderzoekRapportHtml(
  p: any,
  onderzoek: any,
  tekst: string,
  datum: string,
  opts: { bevindingen?: any[]; lengteM?: number } = {}
): string {
  const bevindingen = opts.bevindingen ?? [];
  const gereed = onderzoekGereed(onderzoek.status);
  const kpis: Kpi[] = [
    { label: "Onderzoek", waarde: labelOnderzoek(onderzoek.type), icon: "⚑" },
    { label: "Status", waarde: labelOnderzoekStatus(onderzoek.status), accent: gereed, icon: gereed ? "✓" : "…" },
    { label: "Verplicht", waarde: onderzoek.verplicht ? "Ja" : "Nee", sub: "wettelijk / contractueel", icon: "§" },
  ];
  if (opts.lengteM) kpis.push({ label: "Tracélengte", waarde: `${Math.round(opts.lengteM)} m`, icon: "↔" });

  const metaRijen = [
    onderzoek.uitvoerder ? `<tr><th style="width:170px">Uitvoerder</th><td>${esc(onderzoek.uitvoerder)}</td></tr>` : "",
    onderzoek.aanvraagdatum ? `<tr><th>Aangevraagd</th><td>${dstr(onderzoek.aanvraagdatum)}</td></tr>` : "",
    onderzoek.ontvangstdatum ? `<tr><th>Ontvangen</th><td>${dstr(onderzoek.ontvangstdatum)}</td></tr>` : "",
    onderzoek.verwachtKlaar ? `<tr><th>Verwacht gereed</th><td>${dstr(onderzoek.verwachtKlaar)}</td></tr>` : "",
  ].filter(Boolean);
  const metaTabel = metaRijen.length
    ? `<table style="margin:4px 0 6px"><tbody>${metaRijen.join("")}</tbody></table>`
    : "";

  const bevindingenTabel = bevindingen.length
    ? `<h2>Open-data-bevindingen langs het tracé</h2><table><thead><tr><th>Thema</th><th class="num">Aantal</th><th>Samenvatting</th></tr></thead><tbody>${bevindingen
        .map(
          (b: any) =>
            `<tr><td>${esc(b.thema)}</td><td class="num">${typeof b.aantal === "number" ? b.aantal : "—"}</td><td>${esc(b.samenvatting)}</td></tr>`
        )
        .join("")}</tbody></table>`
    : "";

  const body = kpiKaarten(kpis) + metaTabel + rapportTekstNaarHtml(tekst) + bevindingenTabel;
  return wrap(`Rapportage — ${labelOnderzoek(onderzoek.type)}`, p, body, datum, {
    soort: "Onderzoeksrapport",
    intro: `Conditionerend onderzoek voor project ${p.naam}${p.plaats ? " te " + p.plaats : ""}. Dit rapport onderbouwt de uitvoerbaarheid en de te nemen maatregelen conform de geldende normen en regelgeving.`,
  });
}

function situatiekaart(p: any, datum: string, kaartjeSvg: string): string {
  const coords = (() => {
    try {
      const g = JSON.parse(p.traceGeoJson);
      return (g.geometry?.coordinates ?? []).length;
    } catch {
      return 0;
    }
  })();
  const body = `<figure>${kaartjeSvg}<figcaption class="muted" style="font-size:11px;margin-top:6px">Ingetekend tracé (rood) op de OpenStreetMap-ondergrond — ${coords} knikpunten. Noordpijl en schaalbalk op de kaart. © OpenStreetMap-bijdragers.</figcaption></figure>`;
  return wrap("Situatiekaart tracé", p, body, datum, { soort: "Situatiekaart" });
}

function onderzoekenDoc(p: any, datum: string): string {
  const onderzoeken = p.onderzoeken ?? [];
  const rows = onderzoeken
    .map(
      (o: any) =>
        `<tr><td>${esc(o.titel ?? labelOnderzoek(o.type))}</td><td>${esc(labelOnderzoek(o.type))}</td><td>${esc(o.uitvoerder ?? "—")}</td><td>${onderzoekGereed(o.status) ? `<span class="badge badge-ok">${esc(labelOnderzoekStatus(o.status))}</span>` : `<span class="badge">${esc(labelOnderzoekStatus(o.status))}</span>`}</td><td>${o.verplicht ? "ja" : "nee"}</td></tr>`
    )
    .join("");
  const gereed = onderzoeken.filter((o: any) => onderzoekGereed(o.status)).length;
  const verplicht = onderzoeken.filter((o: any) => o.verplicht).length;
  const kpis: Kpi[] = [
    { label: "Onderzoeken", waarde: String(onderzoeken.length), icon: "⚑" },
    { label: "Afgerond", waarde: `${gereed}/${onderzoeken.length}`, accent: true, icon: "✓" },
    { label: "Verplicht", waarde: String(verplicht), sub: "wettelijk / contractueel", icon: "§" },
  ];
  const statusGroepen: Deel[] = [
    { label: "Gereed", waarde: onderzoeken.filter((o: any) => onderzoekGereed(o.status)).length, kleur: "#0f9d8c" },
    { label: "Loopt", waarde: onderzoeken.filter((o: any) => onderzoekLoopt(o.status)).length, kleur: "#f59e0b" },
    { label: "Open", waarde: onderzoeken.filter((o: any) => !onderzoekGereed(o.status) && !onderzoekLoopt(o.status)).length, kleur: "#94a3b8" },
  ];
  const body =
    kpiKaarten(kpis) +
    statusBalk("Statusverdeling", statusGroepen) +
    `<h2>Conditionerende onderzoeken</h2><table><thead><tr><th>Onderzoek</th><th>Type</th><th>Uitvoerder</th><th>Status</th><th>Verplicht</th></tr></thead><tbody>${rows}</tbody></table>`;
  return wrap("Conditionerende onderzoeken", p, body, datum, { soort: "Onderzoeksregister" });
}

function voorcalculatie(p: any, datum: string): string {
  const regels = p.vocaRegels ?? [];
  const totaal = vocaTotaal(p);
  const rows = regels
    .map(
      (r: any) =>
        `<tr><td>${esc(r.omschrijving)}</td><td>${esc(labelVocaCategorie(r.categorie))}</td><td class="num">${r.hoeveelheid}</td><td>${esc(r.eenheid)}</td><td class="num">${esc(euro(r.eenheidsprijs))}</td><td class="num">${esc(euro(r.hoeveelheid * r.eenheidsprijs))}</td></tr>`
    )
    .join("");
  const perCat = vocaPerCategorie(p);
  const kpis: Kpi[] = [
    { label: "Begrotingstotaal", waarde: euro(totaal), sub: "excl. btw", accent: true, icon: "€" },
    { label: "Posten", waarde: String(regels.length), icon: "≡" },
    { label: "Grootste categorie", waarde: perCat[0] ? perCat[0].label : "—", sub: perCat[0] ? `${Math.round((perCat[0].waarde / totaal) * 100)}% · ${euro(perCat[0].waarde)}` : "", icon: "◆" },
  ];
  const top = [...regels]
    .map((r: any) => ({ label: r.omschrijving, waarde: r.hoeveelheid * r.eenheidsprijs }))
    .sort((a, b) => b.waarde - a.waarde)
    .slice(0, 8);
  const body =
    kpiKaarten(kpis) +
    `<div class="grid2">${donut("Verdeling per categorie", perCat, { euro: true, totaalLabel: "VOCA" })}${staven("Grootste begrotingsposten", top, { euro: true, kleur: CAT[0] })}</div>` +
    `<h2>Voorcalculatie</h2><table><thead><tr><th>Omschrijving</th><th>Categorie</th><th class="num">Hoev.</th><th>Eenh.</th><th class="num">Prijs/eenh.</th><th class="num">Bedrag</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5">Totaal (excl. btw)</td><td class="num">${esc(euro(totaal))}</td></tr></tfoot></table>`;
  return wrap("Voorcalculatie (VOCA)", p, body, datum, {
    soort: "Voorcalculatie",
    intro: "Kostenbegroting met hoeveelheden en eenheidsprijzen per post. De materiaalposten vormen de basis voor het Materiaal Bestellingen Bestand (MBB).",
  });
}

function voorcalculatieCsv(p: any): string {
  const head = "Omschrijving;Categorie;Hoeveelheid;Eenheid;Eenheidsprijs;Bedrag";
  const lines = (p.vocaRegels ?? []).map((r: any) =>
    [r.omschrijving, labelVocaCategorie(r.categorie), r.hoeveelheid, r.eenheid, r.eenheidsprijs, r.hoeveelheid * r.eenheidsprijs]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  return [head, ...lines].join("\r\n");
}

function mbb(p: any, datum: string): string {
  const regels = p.materiaalRegels ?? [];
  const rows = regels
    .map(
      (m: any) =>
        `<tr><td>${esc(m.artikel)}</td><td class="num">${m.hoeveelheid}</td><td>${esc(m.eenheid)}</td><td>${esc(m.leverancier ?? "—")}</td><td>${m.status === "GELEVERD" ? `<span class="badge badge-ok">${esc(labelMbbStatus(m.status))}</span>` : `<span class="badge">${esc(labelMbbStatus(m.status))}</span>`}</td></tr>`
    )
    .join("");
  const geleverd = regels.filter((m: any) => m.status === "GELEVERD").length;
  const leveranciers = new Set(regels.map((m: any) => m.leverancier).filter(Boolean)).size;
  const kpis: Kpi[] = [
    { label: "Artikelregels", waarde: String(regels.length), icon: "▦" },
    { label: "Geleverd", waarde: `${geleverd}/${regels.length}`, accent: true, icon: "✓" },
    { label: "Leveranciers", waarde: String(leveranciers), icon: "⌂" },
  ];
  const statusGroepen: Deel[] = [
    { label: "Geleverd", waarde: regels.filter((m: any) => m.status === "GELEVERD").length, kleur: "#0f9d8c" },
    { label: "Besteld", waarde: regels.filter((m: any) => m.status === "BESTELD").length, kleur: "#f59e0b" },
    { label: "Te bestellen", waarde: regels.filter((m: any) => m.status === "TE_BESTELLEN").length, kleur: "#94a3b8" },
  ];
  const body =
    kpiKaarten(kpis) +
    statusBalk("Bestelstatus", statusGroepen) +
    `<h2>Materiaalbestellingen</h2><table><thead><tr><th>Artikel</th><th class="num">Hoev.</th><th>Eenh.</th><th>Leverancier</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  return wrap("Materiaal Bestellingen Bestand (MBB)", p, body, datum, { soort: "Materiaalbestellingen" });
}

function mbbCsv(p: any): string {
  const head = "Artikel;Hoeveelheid;Eenheid;Leverancier;Status";
  const lines = (p.materiaalRegels ?? []).map((m: any) =>
    [m.artikel, m.hoeveelheid, m.eenheid, m.leverancier ?? "", labelMbbStatus(m.status)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  return [head, ...lines].join("\r\n");
}

function werktekeningen(p: any, datum: string, tekeningen?: { titel: string; svg: string }[]): string {
  const tk = p.werktekeningen ?? [];
  const rows = tk
    .map(
      (t: any) =>
        `<tr><td>${esc(t.tekeningnummer ?? "—")}</td><td>${esc(t.titel)}</td><td>${esc(labelTekeningDiscipline(t.discipline))}</td><td>${esc(t.versie)}</td><td>${t.status === "DEFINITIEF" ? `<span class="badge badge-ok">${esc(labelTekeningStatus(t.status))}</span>` : `<span class="badge">${esc(labelTekeningStatus(t.status))}</span>`}</td></tr>`
    )
    .join("");
  const disciplines = new Map<string, number>();
  for (const t of tk) disciplines.set(t.discipline, (disciplines.get(t.discipline) ?? 0) + 1);
  const kpis: Kpi[] = [
    { label: "Tekeningen", waarde: String(tk.length), icon: "✎" },
    { label: "Definitief", waarde: String(tk.filter((t: any) => t.status === "DEFINITIEF").length), accent: true, icon: "✓" },
    { label: "Disciplines", waarde: String(disciplines.size), icon: "◫" },
  ];
  const register = `<h2>Werktekeningenregister</h2><table><thead><tr><th>Tek.nr</th><th>Titel</th><th>Discipline</th><th>Versie</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  const inline = (tekeningen ?? [])
    .map((t) => `<h2>${esc(t.titel)}</h2><div class="tek">${t.svg}</div>`)
    .join("");
  return wrap("Werktekeningen", p, kpiKaarten(kpis) + register + inline, datum, { soort: "Werktekeningen" });
}

function weekstaten(p: any, datum: string): string {
  const weken = p.weekproducties ?? [];
  let totaal = 0;
  const blokken = weken
    .map((w: any) => {
      const wt = weekBedrag(w);
      totaal += wt;
      const rows = (w.regels ?? [])
        .map(
          (r: any) =>
            `<tr><td>${esc(r.omschrijving)}</td><td class="num">${r.gepland}</td><td class="num">${r.gerealiseerd}</td><td>${esc(r.eenheid)}</td><td class="num">${esc(euro(r.eenheidsprijs))}</td><td class="num">${esc(euro(r.gerealiseerd * r.eenheidsprijs))}</td></tr>`
        )
        .join("");
      return `<h2>Week ${w.jaar}-W${String(w.week).padStart(2, "0")} <span class="muted">(${esc(w.status)})</span> — ${esc(euro(wt))}</h2><table><thead><tr><th>Post</th><th class="num">Gepland</th><th class="num">Gerealiseerd</th><th>Eenh.</th><th class="num">Prijs</th><th class="num">Productie</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");
  const weekData = weken.map((w: any) => ({ label: `W${String(w.week).padStart(2, "0")}`, waarde: weekBedrag(w) }));
  const kpis: Kpi[] = [
    { label: "Weekstaten", waarde: String(weken.length), icon: "▤" },
    { label: "Totale productie", waarde: euro(totaal), accent: true, icon: "€" },
    { label: "Gem. per week", waarde: weken.length ? euro(totaal / weken.length) : "—", icon: "x̄" },
  ];
  const body =
    kpiKaarten(kpis) +
    kolommen("Gerealiseerde productie per week", weekData, { euro: true, cumulatief: true }) +
    blokken +
    `<h2>Totaal gerealiseerde productie</h2><p><strong style="font-size:18px;color:var(--navy)">${esc(euro(totaal))}</strong></p>`;
  return wrap("Weekstaten", p, body, datum, { soort: "Weekstaten", intro: "Wekelijks gerealiseerde productie per post, afgezet tegen de planning. De cumulatieve lijn toont de productievoortgang over de weken." });
}

function termijnstaat(p: any, datum: string): string {
  const t = p.deelbetalingen ?? [];
  const totaal = t.reduce((s: number, d: any) => s + d.bedrag, 0);
  const betaald = t.filter((x: any) => x.status === "BETAALD").reduce((s: number, x: any) => s + x.bedrag, 0);
  const rows = t
    .map(
      (d: any) =>
        `<tr><td>T${d.termijn}</td><td>${dstr(d.datum)}</td><td>${esc(d.omschrijving ?? "—")}</td><td class="num">${esc(euro(d.bedrag))}</td><td>${d.status === "BETAALD" ? `<span class="badge badge-ok">${esc(labelDeelbetalingStatus(d.status))}</span>` : `<span class="badge">${esc(labelDeelbetalingStatus(d.status))}</span>`}</td></tr>`
    )
    .join("");
  const kpis: Kpi[] = [
    { label: "Termijnen", waarde: String(t.length), icon: "≋" },
    { label: "Termijnstaat totaal", waarde: euro(totaal), accent: true, icon: "€" },
    { label: "Uitbetaald", waarde: euro(betaald), sub: totaal ? `${Math.round((betaald / totaal) * 100)}%` : "", icon: "✓" },
  ];
  const body =
    kpiKaarten(kpis) +
    voortgang("Uitbetaald t.o.v. termijnstaat", betaald, totaal || 1, { euro: true }) +
    `<h2>Termijnstaat</h2><table><thead><tr><th>Termijn</th><th>Datum</th><th>Omschrijving</th><th class="num">Bedrag</th><th>Status</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Totaal</td><td class="num">${esc(euro(totaal))}</td><td></td></tr></tfoot></table>`;
  return wrap("Termijnstaat (deelbetalingen)", p, body, datum, { soort: "Termijnstaat" });
}

function deelrevisies(p: any, datum: string): string {
  const rev = p.deelrevisies ?? [];
  const rows = rev
    .map(
      (r: any) =>
        `<tr><td>${esc(r.deel)}</td><td>${esc(r.omschrijving ?? "—")}</td><td>${r.status === "GOEDGEKEURD" ? `<span class="badge badge-ok">${esc(labelDeelrevisieStatus(r.status))}</span>` : `<span class="badge">${esc(labelDeelrevisieStatus(r.status))}</span>`}</td></tr>`
    )
    .join("");
  const goedgekeurd = rev.filter((r: any) => r.status === "GOEDGEKEURD").length;
  const kpis: Kpi[] = [
    { label: "Deelrevisies", waarde: String(rev.length), icon: "↺" },
    { label: "Goedgekeurd", waarde: `${goedgekeurd}/${rev.length}`, accent: true, icon: "✓" },
  ];
  const body =
    kpiKaarten(kpis) +
    `<h2>Deelrevisies (as-built)</h2><table><thead><tr><th>Deel</th><th>Omschrijving</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  return wrap("Deelrevisies (as-built)", p, body, datum, { soort: "Deelrevisies" });
}

/** Bouwt alle dossierstukken voor een volledig geladen project. */
export function bouwDossier(p: any, datum: string, extra: DossierExtra = {}): DossierStuk[] {
  const stukken: DossierStuk[] = [];
  const push = (categorie: string, naam: string, bestandsnaam: string, inhoud: string) =>
    stukken.push({ categorie, naam, bestandsnaam, inhoud });

  if (extra.kaartjeSvg) push("DOSSIER", "Situatiekaart (tracé)", "00b-situatiekaart.html", situatiekaart(p, datum, extra.kaartjeSvg));
  push("BUREAUONDERZOEK", "Bureauonderzoek conditionerende onderzoeken", "01-bureauonderzoek.html", bureauonderzoek(p, datum, extra.kaartjeSvg));
  push("BUREAUONDERZOEK", "Conditionerende onderzoeken (register)", "02-onderzoeken.html", onderzoekenDoc(p, datum));
  push("VOORCALCULATIE", "Voorcalculatie (VOCA)", "03-voorcalculatie.html", voorcalculatie(p, datum));
  push("VOORCALCULATIE", "Voorcalculatie (CSV)", "03-voorcalculatie.csv", voorcalculatieCsv(p));
  push("MBB", "Materiaalbestellingen (MBB)", "04-materiaalbestellingen.html", mbb(p, datum));
  push("MBB", "Materiaalbestellingen (CSV)", "04-materiaalbestellingen.csv", mbbCsv(p));
  push("WERKTEKENINGEN", "Werktekeningen", "05-werktekeningen.html", werktekeningen(p, datum, extra.tekeningen));
  push("WEEKSTAAT", "Weekstaten", "06-weekstaten.html", weekstaten(p, datum));
  push("TERMIJNSTAAT", "Termijnstaat (deelbetalingen)", "07-termijnstaat.html", termijnstaat(p, datum));
  push("DEELREVISIE", "Deelrevisies", "08-deelrevisies.html", deelrevisies(p, datum));

  // Managementsamenvatting als eerste stuk (verwijst naar de rest)
  const cover = managementsamenvatting(
    p,
    datum,
    stukken.map((s) => ({ naam: s.naam, bestandsnaam: s.bestandsnaam })),
    extra
  );
  stukken.unshift({ categorie: "DOSSIER", naam: "Managementsamenvatting (dossier)", bestandsnaam: "00-dossier.html", inhoud: cover });
  return stukken;
}

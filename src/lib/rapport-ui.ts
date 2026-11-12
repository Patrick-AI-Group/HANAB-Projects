// Visuele componentenbibliotheek voor HANAB-rapporten.
// Pure HTML + inline SVG — géén externe assets, géén JS. Server-safe en
// identiek bruikbaar voor losse HTML-stukken en (via esc) ingebedde fragmenten.
// Huisstijl: navy #00214b / #00416e, accent rood #e63223.

export const HANAB = {
  navy: "#00214b",
  navy2: "#00416e",
  accent: "#e63223",
  grid: "#e2e8f0",
  tekst: "#0f172a",
  muted: "#64748b",
} as const;

// Categorische, kleurenblind-vriendelijke reeks — eerst HANAB-huiskleuren.
export const CAT = [
  "#00416e", // navy
  "#e63223", // rood (accent)
  "#0f9d8c", // teal
  "#f59e0b", // amber
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#0891b2", // cyaan
  "#b45309", // brons
  "#64748b", // leisteen
] as const;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const nfInt = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });
function pct(deel: number, totaal: number): number {
  return totaal > 0 ? Math.round((deel / totaal) * 100) : 0;
}

// --- KPI-kaarten -----------------------------------------------------------

export interface Kpi {
  label: string;
  waarde: string;
  sub?: string;
  accent?: boolean; // rood accentstreepje i.p.v. navy
  icon?: string; // kort uni-/emoji of letter, optioneel
}

export function kpiKaarten(items: Kpi[]): string {
  if (!items.length) return "";
  const kaarten = items
    .map(
      (k) =>
        `<div class="kpi${k.accent ? " kpi--accent" : ""}">` +
        (k.icon ? `<div class="kpi-icon">${esc(k.icon)}</div>` : "") +
        `<div class="kpi-waarde">${esc(k.waarde)}</div>` +
        `<div class="kpi-label">${esc(k.label)}</div>` +
        (k.sub ? `<div class="kpi-sub">${esc(k.sub)}</div>` : "") +
        `</div>`
    )
    .join("");
  return `<div class="kpis">${kaarten}</div>`;
}

// --- Donut (aandeel per categorie) -----------------------------------------

export interface Deel {
  label: string;
  waarde: number;
  kleur?: string;
}

export function donut(titel: string, data: Deel[], opts: { euro?: boolean; totaalLabel?: string } = {}): string {
  const rijen = data.filter((d) => d.waarde > 0);
  const totaal = rijen.reduce((s, d) => s + d.waarde, 0);
  if (!totaal) return "";
  const fmt = (n: number) => (opts.euro ? "€ " + nfInt.format(Math.round(n)) : nfInt.format(n));

  const r = 58;
  const sw = 26;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const segs = rijen
    .map((d, i) => {
      const kleur = d.kleur ?? CAT[i % CAT.length];
      const frac = d.waarde / totaal;
      const dash = frac * C;
      const seg = `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${kleur}" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 80 80)"/>`;
      offset += dash;
      return seg;
    })
    .join("");

  const centraal =
    `<text x="80" y="74" text-anchor="middle" font-size="19" font-weight="800" fill="${HANAB.navy}">${esc(fmt(totaal))}</text>` +
    `<text x="80" y="92" text-anchor="middle" font-size="10" fill="${HANAB.muted}">${esc(opts.totaalLabel ?? "totaal")}</text>`;

  const legenda = rijen
    .map(
      (d, i) =>
        `<li><span class="dot" style="background:${d.kleur ?? CAT[i % CAT.length]}"></span>` +
        `<span class="lg-label">${esc(d.label)}</span>` +
        `<span class="lg-val">${esc(fmt(d.waarde))}</span>` +
        `<span class="lg-pct">${pct(d.waarde, totaal)}%</span></li>`
    )
    .join("");

  return (
    `<figure class="chart chart--donut">` +
    (titel ? `<figcaption class="chart-titel">${esc(titel)}</figcaption>` : "") +
    `<div class="donut-wrap">` +
    `<svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="${esc(titel)}">${segs}${centraal}</svg>` +
    `<ul class="legenda">${legenda}</ul>` +
    `</div></figure>`
  );
}

// --- Horizontale staafgrafiek (lange labels) -------------------------------

export function staven(titel: string, data: Deel[], opts: { euro?: boolean; kleur?: string } = {}): string {
  const rijen = data.filter((d) => d.waarde !== 0);
  if (!rijen.length) return "";
  const max = Math.max(...rijen.map((d) => Math.abs(d.waarde)));
  const fmt = (n: number) => (opts.euro ? "€ " + nfInt.format(Math.round(n)) : nfInt.format(n));
  const body = rijen
    .map((d, i) => {
      const w = max > 0 ? Math.max(1.5, (Math.abs(d.waarde) / max) * 100) : 0;
      const kleur = d.kleur ?? opts.kleur ?? CAT[i % CAT.length];
      return (
        `<div class="bar-rij">` +
        `<div class="bar-label" title="${esc(d.label)}">${esc(d.label)}</div>` +
        `<div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(1)}%;background:${kleur}"></div></div>` +
        `<div class="bar-val">${esc(fmt(d.waarde))}</div>` +
        `</div>`
      );
    })
    .join("");
  return `<figure class="chart"><figcaption class="chart-titel">${esc(titel)}</figcaption><div class="bars">${body}</div></figure>`;
}

// --- Kolomgrafiek met cumulatieve lijn (bv. weekproductie) -----------------

export function kolommen(
  titel: string,
  data: { label: string; waarde: number }[],
  opts: { euro?: boolean; cumulatief?: boolean } = {}
): string {
  const rijen = data;
  if (!rijen.length) return "";
  const max = Math.max(...rijen.map((d) => d.waarde), 1);
  const fmt = (n: number) => (opts.euro ? "€ " + nfInt.format(Math.round(n)) : nfInt.format(n));

  const W = 520, H = 190, padL = 8, padR = 8, padT = 16, padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const bw = Math.min(54, (plotW / rijen.length) * 0.62);
  const stap = plotW / rijen.length;

  // cumulatieve lijn
  let cum = 0;
  const totaal = rijen.reduce((s, d) => s + d.waarde, 0);
  const punten: [number, number][] = [];

  const kolommenSvg = rijen
    .map((d, i) => {
      const cx = padL + stap * i + stap / 2;
      const h = (d.waarde / max) * plotH;
      const y = padT + plotH - h;
      cum += d.waarde;
      if (opts.cumulatief && totaal > 0) punten.push([cx, padT + plotH - (cum / totaal) * plotH]);
      return (
        `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" fill="${HANAB.navy2}"/>` +
        `<text x="${cx.toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="${HANAB.navy}">${esc(fmt(d.waarde))}</text>` +
        `<text x="${cx.toFixed(1)}" y="${(H - 12).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${HANAB.muted}">${esc(d.label)}</text>`
      );
    })
    .join("");

  let lijn = "";
  if (opts.cumulatief && punten.length > 1) {
    const path = punten.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const dots = punten.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${HANAB.accent}"/>`).join("");
    lijn = `<path d="${path}" fill="none" stroke="${HANAB.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }

  const baseline = `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="${HANAB.grid}"/>`;

  return (
    `<figure class="chart">` +
    `<figcaption class="chart-titel">${esc(titel)}${opts.cumulatief ? ` <span class="chart-sub"><span class="dot" style="background:${HANAB.accent}"></span>cumulatief</span>` : ""}</figcaption>` +
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(titel)}">${baseline}${kolommenSvg}${lijn}</svg>` +
    `</figure>`
  );
}

// --- Voortgangsbalk --------------------------------------------------------

export function voortgang(
  label: string,
  deel: number,
  totaal: number,
  opts: { euro?: boolean; kleur?: string } = {}
): string {
  const p = pct(deel, totaal);
  const fmt = (n: number) => (opts.euro ? "€ " + nfInt.format(Math.round(n)) : nfInt.format(n));
  return (
    `<div class="voortgang">` +
    `<div class="vg-kop"><span>${esc(label)}</span><span class="vg-cijf">${esc(fmt(deel))} / ${esc(fmt(totaal))} · ${p}%</span></div>` +
    `<div class="vg-track"><div class="vg-fill" style="width:${p}%;background:${opts.kleur ?? HANAB.accent}"></div></div>` +
    `</div>`
  );
}

// --- Gestapelde statusbalk --------------------------------------------------

export function statusBalk(titel: string, segmenten: Deel[]): string {
  const rijen = segmenten.filter((s) => s.waarde > 0);
  const totaal = rijen.reduce((s, d) => s + d.waarde, 0);
  if (!totaal) return "";
  const segs = rijen
    .map((d, i) => `<div class="sb-seg" style="width:${(d.waarde / totaal) * 100}%;background:${d.kleur ?? CAT[i % CAT.length]}" title="${esc(d.label)}: ${d.waarde}"></div>`)
    .join("");
  const legenda = rijen
    .map((d, i) => `<li><span class="dot" style="background:${d.kleur ?? CAT[i % CAT.length]}"></span>${esc(d.label)} <strong>${d.waarde}</strong></li>`)
    .join("");
  return (
    `<figure class="chart">` +
    (titel ? `<figcaption class="chart-titel">${esc(titel)}</figcaption>` : "") +
    `<div class="status-balk">${segs}</div>` +
    `<ul class="legenda legenda--inline">${legenda}</ul>` +
    `</figure>`
  );
}

// --- Tijdlijn (projectfasen) -----------------------------------------------

export interface Stap {
  titel: string;
  datum?: string;
  klaar?: boolean;
  actief?: boolean;
}

export function tijdlijn(stappen: Stap[]): string {
  if (!stappen.length) return "";
  const items = stappen
    .map((s) => {
      const klasse = s.klaar ? "klaar" : s.actief ? "actief" : "open";
      return (
        `<li class="tl-stap tl-${klasse}">` +
        `<div class="tl-dot">${s.klaar ? "✓" : ""}</div>` +
        `<div class="tl-titel">${esc(s.titel)}</div>` +
        (s.datum ? `<div class="tl-datum">${esc(s.datum)}</div>` : "") +
        `</li>`
      );
    })
    .join("");
  return `<ol class="tijdlijn">${items}</ol>`;
}

// --- Gedeelde CSS (wordt in de <head> van elk stuk opgenomen) --------------

export const RAPPORT_CSS = `
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:4px 0 18px}
  .kpi{position:relative;background:#fff;border:1px solid var(--grid);border-radius:12px;padding:14px 16px;overflow:hidden}
  .kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--navy2)}
  .kpi--accent::before{background:var(--accent)}
  .kpi-icon{font-size:15px;opacity:.55;margin-bottom:2px}
  .kpi-waarde{font-size:24px;font-weight:800;color:var(--navy);letter-spacing:-.5px;line-height:1.1;font-variant-numeric:tabular-nums}
  .kpi-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-top:3px;font-weight:600}
  .kpi-sub{font-size:11.5px;color:#475569;margin-top:4px}

  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;margin:10px 0}
  @media (max-width:680px){.grid2{grid-template-columns:1fr}}

  .chart{margin:12px 0 18px}
  .chart-titel{font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
  .chart-sub{font-size:10.5px;font-weight:600;color:var(--muted);text-transform:none;letter-spacing:0;display:inline-flex;align-items:center;gap:5px}
  .dot{display:inline-block;width:10px;height:10px;border-radius:3px;flex:0 0 auto}

  .donut-wrap{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
  .donut-wrap svg{flex:0 0 auto}
  .legenda{list-style:none;margin:0;padding:0;flex:1 1 220px;min-width:200px}
  .legenda li{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px;border-bottom:1px solid #f1f5f9}
  .legenda .lg-label{flex:1 1 auto}
  .legenda .lg-val{font-variant-numeric:tabular-nums;font-weight:600;color:var(--navy)}
  .legenda .lg-pct{width:42px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
  .legenda--inline{display:flex;flex-wrap:wrap;gap:4px 16px}
  .legenda--inline li{border:none;padding:2px 0}

  .bars{display:flex;flex-direction:column;gap:7px}
  .bar-rij{display:grid;grid-template-columns:minmax(120px,38%) 1fr auto;gap:10px;align-items:center;font-size:12.5px}
  .bar-label{color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bar-track{background:#f1f5f9;border-radius:6px;height:16px;overflow:hidden}
  .bar-fill{height:100%;border-radius:6px;min-width:3px}
  .bar-val{font-variant-numeric:tabular-nums;font-weight:600;color:var(--navy);white-space:nowrap}

  .voortgang{margin:10px 0}
  .vg-kop{display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;color:#334155}
  .vg-cijf{font-variant-numeric:tabular-nums;color:var(--muted)}
  .vg-track{background:#f1f5f9;border-radius:999px;height:12px;overflow:hidden}
  .vg-fill{height:100%;border-radius:999px}

  .status-balk{display:flex;height:22px;border-radius:7px;overflow:hidden;border:1px solid var(--grid)}
  .sb-seg{height:100%}

  .tijdlijn{list-style:none;display:flex;margin:14px 0;padding:0;counter-reset:s;gap:0}
  .tl-stap{flex:1;text-align:center;position:relative;padding-top:30px}
  .tl-stap::before{content:"";position:absolute;top:11px;left:0;right:0;height:3px;background:var(--grid)}
  .tl-stap:first-child::before{left:50%}
  .tl-stap:last-child::before{right:50%}
  .tl-klaar::before{background:var(--accent)}
  .tl-dot{position:absolute;top:3px;left:50%;transform:translateX(-50%);width:19px;height:19px;border-radius:50%;background:#fff;border:3px solid var(--grid);font-size:10px;line-height:13px;color:#fff;font-weight:800}
  .tl-klaar .tl-dot{background:var(--accent);border-color:var(--accent)}
  .tl-actief .tl-dot{border-color:var(--accent);box-shadow:0 0 0 3px rgba(230,50,35,.15)}
  .tl-titel{font-size:11.5px;font-weight:700;color:var(--navy)}
  .tl-datum{font-size:10.5px;color:var(--muted);margin-top:2px}

  @media print{
    .kpi,.chart,.voortgang,.tijdlijn,.bar-rij{break-inside:avoid}
  }
`;

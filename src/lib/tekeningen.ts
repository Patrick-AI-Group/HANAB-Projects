// Genereert originele technische werktekeningen als SVG (tracéplan,
// dwarsprofiel, boorprofiel) met een HANAB-titelblok. Volledig lokaal.

import { labelProjectType, labelTekeningDiscipline } from "./domein";

const W = 1040;
const H = 720;
const NAVY = "#00214b";
const ACCENT = "#e63223";
const WATER = "#2563a8";
const KABEL = "#0e4f7d";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function defs(): string {
  return `<defs>
    <pattern id="grond" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="14" height="14" fill="#efe7d6"/><line x1="0" y1="0" x2="0" y2="14" stroke="#cdbf9e" stroke-width="1"/>
    </pattern>
    <pattern id="zand" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#fcf3d6"/><circle cx="2" cy="2" r="1" fill="#d8c583"/><circle cx="7" cy="6" r="1" fill="#d8c583"/>
    </pattern>
    <pattern id="raster" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="#dbe4ee" stroke-width="1"/>
    </pattern>
  </defs>`;
}

function kader(titel: string): string {
  return `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="0" y="0" width="${W}" height="34" fill="${NAVY}"/>
  <rect x="0" y="34" width="${W}" height="3" fill="${ACCENT}"/>
  <text x="16" y="23" fill="#ffffff" font-family="Segoe UI,Arial,sans-serif" font-size="15" font-weight="700">Hanab<tspan fill="${ACCENT}">.</tspan> <tspan font-weight="400" fill="#c7d3e2">BMS — ${esc(titel)}</tspan></text>
  <rect x="6" y="40" width="${W - 12}" height="${H - 46}" fill="none" stroke="#cbd5e1" stroke-width="1.5"/>`;
}

function titelblok(p: any, t: any, schaal: string, datum: string): string {
  const bx = W - 324;
  const by = H - 118;
  const row = (y: number, k: string, v: string) =>
    `<text x="${bx + 10}" y="${y}" font-family="Segoe UI,Arial" font-size="10" fill="#64748b">${esc(k)}</text>` +
    `<text x="${bx + 96}" y="${y}" font-family="Segoe UI,Arial" font-size="11" font-weight="600" fill="#0f172a">${esc(v)}</text>`;
  return `<g>
    <rect x="${bx}" y="${by}" width="312" height="104" fill="#f8fafc" stroke="${NAVY}" stroke-width="1.5"/>
    <rect x="${bx}" y="${by}" width="312" height="20" fill="${NAVY}"/>
    <text x="${bx + 10}" y="${by + 14}" fill="#fff" font-family="Segoe UI,Arial" font-size="11" font-weight="700">HANAB — WERKTEKENING</text>
    ${row(by + 38, "Project", `${p.projectnummer}`)}
    ${row(by + 54, "Titel", `${(t.titel || "").slice(0, 30)}`)}
    ${row(by + 70, "Tek.nr / versie", `${t.tekeningnummer ?? "—"}  (v${t.versie})`)}
    ${row(by + 86, "Schaal / datum", `${schaal}  ·  ${datum}`)}
  </g>`;
}

function noordpijl(x: number, y: number): string {
  return `<g transform="translate(${x},${y})">
    <polygon points="0,-20 7,10 0,3 -7,10" fill="${NAVY}"/>
    <text x="0" y="26" text-anchor="middle" font-family="Arial" font-size="12" font-weight="700" fill="${NAVY}">N</text>
  </g>`;
}

function schaalbalk(x: number, y: number, meters: number, pxPerM: number): string {
  const len = meters * pxPerM;
  return `<g transform="translate(${x},${y})">
    <rect x="0" y="0" width="${len}" height="7" fill="${NAVY}"/>
    <rect x="0" y="0" width="${len / 2}" height="7" fill="#ffffff" stroke="${NAVY}"/>
    <rect x="${len / 2}" y="0" width="${len / 2}" height="7" fill="${NAVY}"/>
    <text x="0" y="22" font-family="Arial" font-size="10" fill="#0f172a">0</text>
    <text x="${len}" y="22" text-anchor="end" font-family="Arial" font-size="10" fill="#0f172a">${meters} m</text>
  </g>`;
}

function svgDoc(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs()}${inner}</svg>`;
}

// --- Tracéplan --------------------------------------------------------------

export function tracetekening(p: any, coords: [number, number][], t: any, datum: string): string {
  const area = { x: 40, y: 60, w: W - 80, h: H - 200 };
  let inner = kader("Tracétekening (situatie)") + `<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="url(#raster)" stroke="#cbd5e1"/>`;

  // Fallback: schematisch recht tracé als er geen coördinaten zijn
  let pts = coords;
  if (pts.length < 2) pts = [[0, 0], [0.0045, 0]];

  const lat0 = pts.reduce((s, c) => s + c[1], 0) / pts.length;
  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((c) => c[0] * mLon);
  const ys = pts.map((c) => c[1] * mLat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  const pad = 40;
  const scale = Math.min((area.w - 2 * pad) / spanX, (area.h - 2 * pad) / spanY);
  const tx = (x: number) => area.x + pad + (x - minX) * scale;
  const ty = (y: number) => area.y + area.h - pad - (y - minY) * scale; // y omhoog

  const scr = pts.map((c) => [tx(c[0] * mLon), ty(c[1] * mLat)] as [number, number]);

  // Parallelle nutsvoorzieningen (water + kabel) als dunne offsetlijnen
  const off = 5;
  const lijn = (dx: number, dy: number, kleur: string, dash: string) =>
    `<polyline points="${scr.map(([x, y]) => `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`).join(" ")}" fill="none" stroke="${kleur}" stroke-width="2" stroke-dasharray="${dash}" opacity="0.8"/>`;
  inner += lijn(-off, -off, WATER, "1 0");
  inner += lijn(off, off, KABEL, "6 4");

  // Hoofdtracé
  inner += `<polyline points="${scr.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="none" stroke="${ACCENT}" stroke-width="3.5"/>`;

  // Stationering + vertices
  let afstand = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = scr[i];
    inner += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#fff" stroke="${NAVY}" stroke-width="2"/>`;
    if (i > 0) {
      const dx = (pts[i][0] - pts[i - 1][0]) * mLon;
      const dy = (pts[i][1] - pts[i - 1][1]) * mLat;
      afstand += Math.sqrt(dx * dx + dy * dy);
    }
    inner += `<text x="${(x + 7).toFixed(1)}" y="${(y - 7).toFixed(1)}" font-family="Arial" font-size="10" fill="${NAVY}">${i === 0 ? "0+000" : `0+${String(Math.round(afstand)).padStart(3, "0")}`}</text>`;
  }

  // Legenda
  const lx = area.x + 14, ly = area.y + area.h - 70;
  inner += `<g>
    <rect x="${lx}" y="${ly}" width="210" height="58" fill="#ffffff" stroke="#cbd5e1"/>
    <text x="${lx + 8}" y="${ly + 16}" font-family="Arial" font-size="11" font-weight="700" fill="${NAVY}">Legenda</text>
    <line x1="${lx + 8}" y1="${ly + 30}" x2="${lx + 34}" y2="${ly + 30}" stroke="${ACCENT}" stroke-width="3.5"/><text x="${lx + 40}" y="${ly + 33}" font-family="Arial" font-size="10">Tracé (werkgrens)</text>
    <line x1="${lx + 8}" y1="${ly + 44}" x2="${lx + 34}" y2="${ly + 44}" stroke="${WATER}" stroke-width="2"/><text x="${lx + 40}" y="${ly + 47}" font-family="Arial" font-size="10">Waterleiding</text>
    <line x1="${lx + 120}" y1="${ly + 44}" x2="${lx + 146}" y2="${ly + 44}" stroke="${KABEL}" stroke-width="2" stroke-dasharray="6 4"/><text x="${lx + 152}" y="${ly + 47}" font-family="Arial" font-size="10">MS-kabel</text>
  </g>`;

  const totaalM = Math.round(afstand);
  inner += noordpijl(area.x + area.w - 40, area.y + 44);
  inner += schaalbalk(area.x + 14, area.y + area.h + 24, 100, scale);
  inner += `<text x="${area.x + 14}" y="${area.y + area.h + 58}" font-family="Arial" font-size="11" fill="#0f172a">Tracélengte ca. <tspan font-weight="700">${totaalM} m</tspan> · ${pts.length} knikpunten · type: ${esc(labelProjectType(p.type))}</text>`;
  inner += titelblok(p, t, "zie schaalbalk", datum);
  return svgDoc(inner);
}

// --- Dwarsprofiel -----------------------------------------------------------

export function dwarsprofiel(p: any, t: any, datum: string): string {
  const title = t.discipline === "DETAIL" ? "Detailtekening (sleufprofiel)" : "Dwarsprofiel sleuf";
  let inner = kader(title);
  const gx = 90, gw = W - 420, surf = 150, diep = 430;

  // Maaiveld + asfalt + grond
  inner += `<rect x="${gx}" y="${surf}" width="${gw}" height="${diep - surf}" fill="url(#grond)" stroke="#b9a97f"/>`;
  inner += `<rect x="${gx}" y="${surf}" width="${gw}" height="16" fill="#2b2f36"/>`;
  inner += `<text x="${gx}" y="${surf - 8}" font-family="Arial" font-size="11" fill="#0f172a">maaiveld / verharding</text>`;
  inner += `<line x1="${gx}" y1="${surf}" x2="${gx + gw}" y2="${surf}" stroke="#0f172a" stroke-width="1.5"/>`;

  // Sleuf (talud)
  const sx = gx + gw / 2 - 150, sw = 300, sdepth = 210;
  const top = surf + 16;
  const sleuf = `M${sx},${top} L${sx + 34},${top + sdepth} L${sx + sw - 34},${top + sdepth} L${sx + sw},${top} Z`;
  inner += `<path d="${sleuf}" fill="url(#zand)" stroke="#9c8c56"/>`;

  // Grondwaterlijn
  const gws = top + 120;
  inner += `<line x1="${gx}" y1="${gws}" x2="${gx + gw}" y2="${gws}" stroke="${WATER}" stroke-width="1.5" stroke-dasharray="7 5"/>`;
  inner += `<text x="${gx + 4}" y="${gws - 5}" font-family="Arial" font-size="10" fill="${WATER}">GWS (indicatief)</text>`;

  // Waarschuwingslint
  const bedt = top + sdepth - 70;
  inner += `<line x1="${sx + 34}" y1="${bedt}" x2="${sx + sw - 34}" y2="${bedt}" stroke="${ACCENT}" stroke-width="4" stroke-dasharray="14 9"/>`;

  // Waterleiding + kabelbuizen in bedding
  const cy = top + sdepth - 40;
  inner += `<circle cx="${sx + 110}" cy="${cy}" r="30" fill="#bce4fa" stroke="#fff" stroke-width="3"/><circle cx="${sx + 110}" cy="${cy}" r="19" fill="${WATER}"/>`;
  inner += `<text x="${sx + 110}" y="${cy + 54}" text-anchor="middle" font-family="Arial" font-size="10">Ø110 PE water</text>`;
  const bx = sx + 200;
  inner += `<circle cx="${bx}" cy="${cy - 8}" r="13" fill="${ACCENT}" stroke="#fff" stroke-width="2"/>`;
  inner += `<circle cx="${bx + 28}" cy="${cy - 2}" r="13" fill="${KABEL}" stroke="#fff" stroke-width="2"/>`;
  inner += `<circle cx="${bx + 14}" cy="${cy + 20}" r="13" fill="#dbe7f3" stroke="#fff" stroke-width="2"/>`;
  inner += `<text x="${bx + 14}" y="${cy + 54}" text-anchor="middle" font-family="Arial" font-size="10">MS-kabel + mantelbuis</text>`;

  // Maatlijnen
  inner += `<line x1="${sx - 20}" y1="${top}" x2="${sx - 20}" y2="${top + sdepth}" stroke="#0f172a" stroke-width="1"/>`;
  inner += `<text x="${sx - 26}" y="${top + sdepth / 2}" font-family="Arial" font-size="10" fill="#0f172a" transform="rotate(-90 ${sx - 26} ${top + sdepth / 2})" text-anchor="middle">diepte ca. 1,50 m</text>`;
  inner += `<line x1="${sx + 34}" y1="${top + sdepth + 18}" x2="${sx + sw - 34}" y2="${top + sdepth + 18}" stroke="#0f172a" stroke-width="1"/>`;
  inner += `<text x="${sx + sw / 2}" y="${top + sdepth + 32}" text-anchor="middle" font-family="Arial" font-size="10">sleufbreedte ca. 1,20 m</text>`;

  // Legenda
  const lx = gx, ly = diep + 40;
  inner += `<g font-family="Arial" font-size="10">
    <rect x="${lx}" y="${ly}" width="16" height="12" fill="url(#zand)" stroke="#9c8c56"/><text x="${lx + 22}" y="${ly + 11}">aanvulzand / bedding</text>
    <rect x="${lx + 170}" y="${ly}" width="16" height="12" fill="url(#grond)" stroke="#b9a97f"/><text x="${lx + 192}" y="${ly + 11}">uitkomende grond</text>
    <line x1="${lx + 320}" y1="${ly + 6}" x2="${lx + 346}" y2="${ly + 6}" stroke="${ACCENT}" stroke-width="4" stroke-dasharray="10 6"/><text x="${lx + 352}" y="${ly + 11}">waarschuwingslint</text>
  </g>`;

  inner += titelblok(p, t, "1:25", datum);
  return svgDoc(inner);
}

// --- Boorprofiel ------------------------------------------------------------

export function boorprofiel(p: any, t: any, datum: string, cptAantal: number): string {
  let inner = kader("Boorprofiel / bodemopbouw");
  const x = 120, top = 70, colW = 150, mPx = 150; // 1 m = 150px → 0..3,5m
  const lagen = [
    { van: 0, tot: 0.6, naam: "Zand, matig fijn (ophoging)", pat: "zand" },
    { van: 0.6, tot: 1.4, naam: "Klei, siltig", pat: "grond" },
    { van: 1.4, tot: 2.3, naam: "Zand, matig grof", pat: "zand" },
    { van: 2.3, tot: 3.4, naam: "Veen / klei (slap)", pat: "grond" },
  ];
  // Diepteschaal
  for (let d = 0; d <= 3.5; d += 0.5) {
    const y = top + d * mPx;
    inner += `<line x1="${x - 8}" y1="${y}" x2="${x}" y2="${y}" stroke="#0f172a"/><text x="${x - 12}" y="${y + 4}" text-anchor="end" font-family="Arial" font-size="10">-${d.toFixed(1)} m</text>`;
  }
  for (const l of lagen) {
    const y = top + l.van * mPx;
    const h = (l.tot - l.van) * mPx;
    inner += `<rect x="${x}" y="${y}" width="${colW}" height="${h}" fill="url(#${l.pat})" stroke="#9c8c56"/>`;
    inner += `<text x="${x + colW + 12}" y="${y + h / 2 + 4}" font-family="Arial" font-size="11" fill="#0f172a">${esc(l.naam)}  (${l.van.toFixed(1)}–${l.tot.toFixed(1)} m)</text>`;
  }
  // Grondwaterstand
  const gwy = top + 1.1 * mPx;
  inner += `<line x1="${x - 4}" y1="${gwy}" x2="${x + colW + 4}" y2="${gwy}" stroke="${WATER}" stroke-width="2" stroke-dasharray="7 5"/>`;
  inner += `<text x="${x + colW + 12}" y="${gwy - 4}" font-family="Arial" font-size="10" fill="${WATER}">grondwaterstand (indicatief)</text>`;

  inner += `<text x="${x}" y="${top + 3.9 * mPx}" font-family="Arial" font-size="11" fill="#0f172a">Bron: BRO-sonderingen in omgeving (${cptAantal} CPT) + bodemkaart. Indicatief; nader geotechnisch onderzoek bij boring/persing.</text>`;
  inner += titelblok(p, t, "1:50", datum);
  return svgDoc(inner);
}

// --- Gestuurde boring (HDD) — langsprofiel ---------------------------------

export function gestuurdeBoring(p: any, t: any, datum: string, cptAantal: number): string {
  let inner = kader("Langsprofiel gestuurde boring (HDD)");
  const surf = 190; // maaiveld (y)
  const x0 = 80, x1 = 960;
  const mPx = 48; // 1 m verticaal

  // Grondpakket + maaiveld
  inner += `<rect x="${x0}" y="${surf}" width="${x1 - x0}" height="${560 - surf}" fill="url(#grond)" stroke="#b9a97f"/>`;
  inner += `<rect x="${x0}" y="${surf}" width="${x1 - x0}" height="8" fill="#2b2f36"/>`;
  inner += `<text x="${x0 + 4}" y="${surf - 8}" font-family="Arial" font-size="11" fill="#0f172a">maaiveld</text>`;

  // Diepteschaal links
  for (let d = 0; d <= 7; d++) {
    const y = surf + d * mPx;
    if (y > 560) break;
    inner += `<line x1="${x0 - 8}" y1="${y}" x2="${x0}" y2="${y}" stroke="#0f172a"/><text x="${x0 - 12}" y="${y + 4}" text-anchor="end" font-family="Arial" font-size="9" fill="#475569">${d === 0 ? "0" : "-" + d + " m"}</text>`;
  }

  // Watergang (obstakel in het midden)
  const wL = 455, wR = 590, wTop = surf + 6, wBed = surf + 55;
  inner += `<polygon points="${wL},${surf} ${wR},${surf} ${wR - 14},${wBed} ${wL + 14},${wBed}" fill="#bfe0f5" stroke="#6aa6cf"/>`;
  inner += `<rect x="${wL + 2}" y="${wTop}" width="${wR - wL - 4}" height="10" fill="#8fc4e6"/>`;
  inner += `<text x="${(wL + wR) / 2}" y="${surf - 8}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="700" fill="#1e5a86">watergang</text>`;

  // Boorlijn (HDD): ondiepe intrede, duikt onder watergang door, ondiepe uittrede
  const path = `M130,${surf} L250,${surf + 46} C430,${surf + 240} 610,${surf + 240} 790,${surf + 46} L910,${surf}`;
  inner += `<path d="${path}" fill="none" stroke="${NAVY}" stroke-width="1.6" stroke-dasharray="7 5"/>`;
  // Ingetrokken productbundel (waterleiding + mantelbuis kabels)
  inner += `<path d="${path}" fill="none" stroke="${WATER}" stroke-width="6" stroke-linecap="round" opacity="0.9"/>`;

  // Intrede-/uittredepunt + boorstelling-symbool
  const rig = (x: number, label: string, hoek: string, kant: 1 | -1) =>
    `<polygon points="${x},${surf} ${x - 12 * kant},${surf - 22} ${x + 2 * kant},${surf - 22}" fill="${ACCENT}"/>` +
    `<circle cx="${x}" cy="${surf}" r="4" fill="#fff" stroke="${NAVY}" stroke-width="2"/>` +
    `<text x="${x}" y="${surf - 28}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="700" fill="${NAVY}">${label}</text>` +
    `<text x="${x + 6 * kant}" y="${surf + 20}" text-anchor="${kant === 1 ? "start" : "end"}" font-family="Arial" font-size="9" fill="#475569">${hoek}</text>`;
  inner += rig(130, "intredepunt", "intredehoek ca. 12°", 1);
  inner += rig(910, "uittredepunt", "uittredehoek ca. 12°", -1);

  // Gronddekking onder waterbodem (maatlijn)
  const dekX = 522;
  const boorTop = surf + 212; // ~diepste punt boorlijn
  inner += `<line x1="${dekX}" y1="${wBed}" x2="${dekX}" y2="${boorTop}" stroke="${ACCENT}" stroke-width="1.3"/>`;
  inner += `<line x1="${dekX - 5}" y1="${wBed}" x2="${dekX + 5}" y2="${wBed}" stroke="${ACCENT}"/><line x1="${dekX - 5}" y1="${boorTop}" x2="${dekX + 5}" y2="${boorTop}" stroke="${ACCENT}"/>`;
  inner += `<text x="${dekX + 10}" y="${(wBed + boorTop) / 2}" font-family="Arial" font-size="10" fill="${ACCENT}">gronddekking ca. ${((boorTop - wBed) / mPx).toFixed(1).replace(".", ",")} m</text>`;

  // Boorlengte (horizontale maatlijn)
  const by = 545;
  inner += `<line x1="130" y1="${by}" x2="910" y2="${by}" stroke="#0f172a" stroke-width="1"/>`;
  inner += `<line x1="130" y1="${by - 5}" x2="130" y2="${by + 5}" stroke="#0f172a"/><line x1="910" y1="${by - 5}" x2="910" y2="${by + 5}" stroke="#0f172a"/>`;
  inner += `<text x="520" y="${by + 16}" text-anchor="middle" font-family="Arial" font-size="10">boorlengte ca. 95 m (indicatief)</text>`;

  // Legenda + noot
  inner += `<g font-family="Arial" font-size="10">
    <line x1="${x0 + 4}" y1="600" x2="${x0 + 30}" y2="600" stroke="${WATER}" stroke-width="6"/><text x="${x0 + 36}" y="604">ingetrokken leiding/mantelbuis</text>
    <line x1="${x0 + 250}" y1="600" x2="${x0 + 276}" y2="600" stroke="${NAVY}" stroke-width="1.6" stroke-dasharray="7 5"/><text x="${x0 + 282}" y="604">boorlijn (HDD)</text>
  </g>`;
  inner += `<text x="${x0 + 4}" y="624" font-family="Arial" font-size="10" fill="#64748b">Ontwerp indicatief; definitieve boorlijn op basis van ${cptAantal} BRO-sondering(en) en boorberekening.</text>`;

  inner += titelblok(p, t, "1:200 (indicatief)", datum);
  return svgDoc(inner);
}

// --- Detailtekeningen -------------------------------------------------------

function detailHuisaansluiting(p: any, t: any, datum: string): string {
  let inner = kader("Detailtekening — huisaansluiting (water)");
  const mainY = 230;
  const x0 = 110, x1 = 720;
  // Hoofdleiding
  inner += `<line x1="${x0}" y1="${mainY}" x2="${x1}" y2="${mainY}" stroke="${WATER}" stroke-width="9"/>`;
  inner += `<text x="${x0}" y="${mainY - 14}" font-family="Arial" font-size="11" fill="#0f172a">hoofdleiding PE Ø110 (nieuw)</text>`;
  // Aftakking (T-stuk) naar woning
  const tx = 360, houseY = 470;
  inner += `<rect x="${tx - 7}" y="${mainY - 7}" width="14" height="14" fill="${NAVY}"/>`; // T-stuk
  inner += `<line x1="${tx}" y1="${mainY}" x2="${tx}" y2="${houseY}" stroke="${WATER}" stroke-width="5"/>`;
  inner += `<text x="${tx + 10}" y="${(mainY + houseY) / 2}" font-family="Arial" font-size="11" fill="#0f172a">huisaansluiting Ø40</text>`;
  // Afsluiter (symbool: twee driehoeken)
  const av = mainY + 60;
  inner += `<polygon points="${tx - 9},${av - 9} ${tx},${av} ${tx - 9},${av + 9}" fill="#fff" stroke="${NAVY}" stroke-width="1.5"/><polygon points="${tx + 9},${av - 9} ${tx},${av} ${tx + 9},${av + 9}" fill="#fff" stroke="${NAVY}" stroke-width="1.5"/>`;
  inner += `<text x="${tx + 16}" y="${av + 4}" font-family="Arial" font-size="10" fill="#0f172a">afsluiter + beugel</text>`;
  // Woning
  inner += `<rect x="${tx - 70}" y="${houseY}" width="140" height="90" fill="#eef2f7" stroke="${NAVY}" stroke-width="1.5"/>`;
  inner += `<polygon points="${tx - 70},${houseY} ${tx},${houseY - 34} ${tx + 70},${houseY}" fill="#dbe4ee" stroke="${NAVY}" stroke-width="1.5"/>`;
  inner += `<text x="${tx}" y="${houseY + 50}" text-anchor="middle" font-family="Arial" font-size="12" fill="#0f172a">woning</text>`;
  inner += `<text x="${tx}" y="${houseY + 70}" text-anchor="middle" font-family="Arial" font-size="10" fill="#64748b">watermeter in meterkast</text>`;
  // Perceelsgrens
  const pg = 560;
  inner += `<line x1="${pg}" y1="110" x2="${pg}" y2="620" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="8 6"/>`;
  inner += `<text x="${pg + 6}" y="130" font-family="Arial" font-size="10" fill="#64748b">perceelsgrens</text>`;
  // Legenda
  inner += `<g font-family="Arial" font-size="10"><line x1="${x0}" y1="640" x2="${x0 + 26}" y2="640" stroke="${WATER}" stroke-width="6"/><text x="${x0 + 34}" y="644">waterleiding</text></g>`;
  inner += titelblok(p, t, "1:20", datum);
  return svgDoc(inner);
}

function detailKruising(p: any, t: any, datum: string): string {
  let inner = kader("Detailtekening — kruising bestaande infra");
  const gx = 90, gw = 560, surf = 150;
  inner += `<rect x="${gx}" y="${surf}" width="${gw}" height="380" fill="url(#grond)" stroke="#b9a97f"/>`;
  inner += `<rect x="${gx}" y="${surf}" width="${gw}" height="14" fill="#2b2f36"/>`;
  inner += `<text x="${gx}" y="${surf - 8}" font-family="Arial" font-size="11">maaiveld</text>`;
  // Onze nieuwe leiding (langs, in beeld als cirkel) onderin
  const onsY = surf + 250;
  inner += `<circle cx="${gx + 200}" cy="${onsY}" r="26" fill="#bce4fa" stroke="#fff" stroke-width="3"/><circle cx="${gx + 200}" cy="${onsY}" r="16" fill="${WATER}"/>`;
  inner += `<text x="${gx + 200}" y="${onsY + 46}" text-anchor="middle" font-family="Arial" font-size="10">nieuwe waterleiding</text>`;
  // Bestaande kruisende leiding (dwars → cirkel met arcering), hoger gelegen
  const kruisY = surf + 130;
  inner += `<circle cx="${gx + 340}" cy="${kruisY}" r="30" fill="#f1d7a6" stroke="#9c8c56" stroke-width="2"/>`;
  inner += `<circle cx="${gx + 340}" cy="${kruisY}" r="30" fill="none" stroke="#9c8c56" stroke-width="1" stroke-dasharray="3 3"/>`;
  inner += `<text x="${gx + 340}" y="${kruisY - 40}" text-anchor="middle" font-family="Arial" font-size="10">bestaande leiding (kruisend)</text>`;
  // Mantelbuis om kruising
  inner += `<circle cx="${gx + 340}" cy="${kruisY}" r="40" fill="none" stroke="${NAVY}" stroke-width="2" stroke-dasharray="6 4"/>`;
  inner += `<text x="${gx + 340}" y="${kruisY + 58}" text-anchor="middle" font-family="Arial" font-size="10">beschermbuis (mantel)</text>`;
  // Vrije ruimte maatlijn tussen bestaande en nieuwe
  inner += `<line x1="${gx + 430}" y1="${kruisY}" x2="${gx + 430}" y2="${onsY}" stroke="${ACCENT}" stroke-width="1.5"/>`;
  inner += `<text x="${gx + 438}" y="${(kruisY + onsY) / 2}" font-family="Arial" font-size="10" fill="${ACCENT}">vrije ruimte ≥ 0,30 m</text>`;
  inner += titelblok(p, t, "1:20", datum);
  return svgDoc(inner);
}

function detailtekening(p: any, t: any, datum: string): string {
  const titel = (t.titel || "").toLowerCase();
  if (/huisaansluit|aansluit/.test(titel)) return detailHuisaansluiting(p, t, datum);
  return detailKruising(p, t, datum);
}

/** Kiest de juiste tekening op basis van discipline. */
export function tekeningVoor(
  p: any,
  coords: [number, number][],
  t: any,
  datum: string,
  cptAantal: number
): string {
  if (t.discipline === "TRACE") return tracetekening(p, coords, t, datum);
  if (t.discipline === "BOORPROFIEL") return gestuurdeBoring(p, t, datum, cptAantal);
  if (t.discipline === "DETAIL") return detailtekening(p, t, datum);
  return dwarsprofiel(p, t, datum);
}

export { labelTekeningDiscipline };

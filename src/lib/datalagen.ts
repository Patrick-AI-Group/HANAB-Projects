// Gesimuleerde datalagen voor de demo.
//
// HANAB werkt aan kabels, leidingen en grondwerk. De meest relevante lagen
// (KLIC kabels & leidingen, niet-gesprongen explosieven, archeologische
// verwachting, bomen) zijn niet als vrije WMS beschikbaar. Daarom genereren we
// ze hier *realistisch maar gesimuleerd* langs het ingetekende tracé, zodat de
// demo altijd een complete ondergrond laat zien. De echte achtergrond- en
// milieulagen (luchtfoto, Natura 2000, bodem, percelen, hoogte) komen van PDOK.

export type LngLat = [number, number]; // [lon, lat] — GeoJSON-volgorde

export type LijnFeature = { coords: LngLat[]; kleur: string; dik: number; dash?: string; label: string };
export type VlakFeature = { ring: LngLat[]; kleur: string; label: string; opacity?: number };
export type PuntFeature = { punt: LngLat; kleur: string; label: string; radius?: number };

// Meters per graad op een gegeven breedtegraad.
function mPerGraad(lat: number) {
  const latM = 111320;
  const lonM = 111320 * Math.cos((lat * Math.PI) / 180);
  return { latM, lonM: lonM || 1 };
}

// Verleng een tracé met tussenpunten zodat offset-lijnen vloeiend meelopen.
function verdicht(pts: LngLat[], stapM = 25): LngLat[] {
  if (pts.length < 2) return pts;
  const out: LngLat[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [lon1, lat1] = pts[i - 1];
    const [lon2, lat2] = pts[i];
    const { latM, lonM } = mPerGraad((lat1 + lat2) / 2);
    const dM = Math.hypot((lon2 - lon1) * lonM, (lat2 - lat1) * latM);
    const n = Math.max(1, Math.round(dM / stapM));
    for (let k = 1; k <= n; k++) {
      out.push([lon1 + ((lon2 - lon1) * k) / n, lat1 + ((lat2 - lat1) * k) / n]);
    }
  }
  return out;
}

// Verschuif een lijn loodrecht met `meters` (positief = links van de rijrichting).
function offset(pts: LngLat[], meters: number): LngLat[] {
  if (pts.length < 2) return pts;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const lat = p[1];
    const { latM, lonM } = mPerGraad(lat);
    let dx = (b[0] - a[0]) * lonM;
    let dy = (b[1] - a[1]) * latM;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // loodrecht links: (-dy, dx)
    const px = -dy;
    const py = dx;
    return [p[0] + (px * meters) / lonM, p[1] + (py * meters) / latM] as LngLat;
  });
}

// Punt op fractie t (0..1) langs het tracé.
function puntOp(pts: LngLat[], t: number): LngLat {
  if (pts.length === 0) return [5.38, 52.15];
  if (pts.length === 1) return pts[0];
  const idx = Math.min(pts.length - 2, Math.max(0, Math.floor(t * (pts.length - 1))));
  const f = t * (pts.length - 1) - idx;
  const a = pts[idx];
  const b = pts[idx + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// Grillige (natuurlijk ogende) cirkel-ring rond een middelpunt — deterministisch.
function blob(center: LngLat, radiusM: number, zaad: number): LngLat[] {
  const [lon, lat] = center;
  const { latM, lonM } = mPerGraad(lat);
  const ring: LngLat[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * 2 * Math.PI;
    const r = radiusM * (0.78 + 0.22 * Math.sin(3 * a + zaad) + 0.12 * Math.cos(5 * a + zaad * 2));
    ring.push([lon + (Math.cos(a) * r) / lonM, lat + (Math.sin(a) * r) / latM]);
  }
  return ring;
}

// Val terug op een plausibel straat-segment rond een ankerpunt als er nog geen
// tracé is ingetekend (± 160 m onder een lichte hoek).
function basis(trace: LngLat[], center: LngLat): LngLat[] {
  if (trace.length >= 2) return verdicht(trace);
  const [lon, lat] = center;
  const { latM, lonM } = mPerGraad(lat);
  const brg = 0.5; // radialen
  const halfM = 160;
  const dLon = (Math.sin(brg) * halfM) / lonM;
  const dLat = (Math.cos(brg) * halfM) / latM;
  return verdicht([
    [lon - dLon, lat - dLat],
    [lon + dLon, lat + dLat],
  ]);
}

// ── KLIC: kabels & leidingen, parallel aan het tracé (kleuren ~ NEN/KLIC) ──
export function klicKabels(trace: LngLat[], center: LngLat): LijnFeature[] {
  const l = basis(trace, center);
  const defs: Array<Omit<LijnFeature, "coords"> & { off: number }> = [
    { off: -2.0, kleur: "#d81e1e", dik: 3, label: "Elektra laagspanning (LS)" },
    { off: 2.0, kleur: "#f2b705", dik: 3, label: "Gas lage druk (max. 100 mbar)" },
    { off: -3.6, kleur: "#1f6fd6", dik: 4, label: "Drinkwater (ø 160 PVC)" },
    { off: 3.6, kleur: "#ff8c1a", dik: 2, dash: "1 5", label: "Telecom / data (glasvezel)" },
    { off: -5.2, kleur: "#7a5230", dik: 5, dash: "10 6", label: "Riool vrijverval (ø 400 beton)" },
    { off: 5.2, kleur: "#b11fd8", dik: 4, label: "Elektra middenspanning (MS 10 kV)" },
  ];
  return defs.map((d) => ({
    coords: offset(l, d.off),
    kleur: d.kleur,
    dik: d.dik,
    dash: d.dash,
    label: d.label,
  }));
}

// ── CE: niet-gesprongen explosieven — verdachte gebieden ──
export function ceGebieden(trace: LngLat[], center: LngLat): VlakFeature[] {
  const l = basis(trace, center);
  return [
    {
      ring: blob(puntOp(l, 0.32), 85, 1.3),
      kleur: "#d81e1e",
      label: "CE-verdacht gebied — afwerpmunitie WOII · vooronderzoek + detectie vereist",
      opacity: 0.22,
    },
    {
      ring: blob(puntOp(l, 0.74), 60, 2.7),
      kleur: "#d81e1e",
      label: "CE-verdacht gebied — geschutmunitie · laagsgewijs ontgraven onder OCE-begeleiding",
      opacity: 0.22,
    },
  ];
}

// ── Archeologische verwachting ──
export function archeologie(trace: LngLat[], center: LngLat): VlakFeature[] {
  const l = basis(trace, center);
  return [
    {
      ring: blob(puntOp(l, 0.18), 120, 0.4),
      kleur: "#8a5a00",
      label: "Hoge archeologische verwachting — onderzoeksplicht > 100 m² / > 0,30 m -mv",
      opacity: 0.3,
    },
    {
      ring: blob(puntOp(l, 0.55), 150, 2.1),
      kleur: "#c79a3a",
      label: "Middelhoge verwachting — onderzoeksplicht > 500 m²",
      opacity: 0.25,
    },
    {
      ring: blob(puntOp(l, 0.9), 110, 3.5),
      kleur: "#d9c892",
      label: "Lage verwachting — vrijgesteld van onderzoek",
      opacity: 0.22,
    },
  ];
}

// ── Bomen (boomregister) — langs het tracé, relevant voor wortelzones ──
export function bomen(trace: LngLat[], center: LngLat): PuntFeature[] {
  const l = basis(trace, center);
  const uit: PuntFeature[] = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const zij = i % 2 === 0 ? 7 : -7;
    const p = offset(l, zij + 3 * Math.sin(i * 1.7));
    const punt = puntOp(p, t);
    const rooien = i % 5 === 2; // enkele te rooien, rest handhaven
    uit.push({
      punt,
      kleur: rooien ? "#c0392b" : "#1e8449",
      label: rooien
        ? "Boom — te rooien (binnen ontgravingsprofiel) · kapmelding vereist"
        : "Boom — handhaven · beschermde wortelzone, handmatig graven",
      radius: 5,
    });
  }
  return uit;
}

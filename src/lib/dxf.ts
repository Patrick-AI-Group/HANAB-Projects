// Lichtgewicht DXF-import voor de demo.
// Haalt de grootste LINE/LWPOLYLINE/POLYLINE-keten uit een DXF-tekst en
// projecteert die (lokale tekening-coördinaten in meters) rond een ankerpunt
// op de kaart, zodat de vorm van de tekening het tracé bepaalt.

export type LngLat = [number, number]; // [lon, lat] — GeoJSON-volgorde

type XY = [number, number];

// DXF is een "tagged" formaat: om-en-om een groepscode-regel en een waarde-regel.
function leesParen(tekst: string): Array<[number, string]> {
  const regels = tekst.split(/\r\n|\r|\n/);
  const paren: Array<[number, string]> = [];
  for (let i = 0; i + 1 < regels.length; i += 2) {
    const code = parseInt(regels[i].trim(), 10);
    if (Number.isNaN(code)) {
      // Uit de pas gelopen — probeer te hersynchroniseren op de volgende regel.
      i -= 1;
      continue;
    }
    paren.push([code, regels[i + 1] ?? ""]);
  }
  return paren;
}

// Verzamel losse polylijnen (ketens van punten) uit de ENTITIES-sectie.
function haalKetens(paren: Array<[number, string]>): XY[][] {
  const ketens: XY[][] = [];
  let huidig: { type: string; punten: XY[]; x?: number; y?: number } | null = null;

  const sluit = () => {
    if (huidig && huidig.punten.length >= 2) ketens.push(huidig.punten);
    huidig = null;
  };

  for (let i = 0; i < paren.length; i++) {
    const [code, waardeRaw] = paren[i];
    const waarde = waardeRaw.trim();

    if (code === 0) {
      // Nieuwe entiteit begint — vorige afsluiten.
      sluit();
      if (waarde === "LINE" || waarde === "LWPOLYLINE" || waarde === "POLYLINE") {
        huidig = { type: waarde, punten: [] };
      }
      continue;
    }
    if (!huidig) continue;

    if (huidig.type === "LINE") {
      // LINE: 10/20 = start, 11/21 = eind.
      if (code === 10) huidig.punten[0] = [parseFloat(waarde), huidig.punten[0]?.[1] ?? 0];
      else if (code === 20) huidig.punten[0] = [huidig.punten[0]?.[0] ?? 0, parseFloat(waarde)];
      else if (code === 11) huidig.punten[1] = [parseFloat(waarde), huidig.punten[1]?.[1] ?? 0];
      else if (code === 21) huidig.punten[1] = [huidig.punten[1]?.[0] ?? 0, parseFloat(waarde)];
    } else {
      // (LW)POLYLINE: elke 10 opent een vertex, bijbehorende 20 sluit 'm.
      if (code === 10) {
        huidig.x = parseFloat(waarde);
      } else if (code === 20) {
        huidig.y = parseFloat(waarde);
        if (huidig.x !== undefined && huidig.y !== undefined) {
          huidig.punten.push([huidig.x, huidig.y]);
          huidig.x = undefined;
          huidig.y = undefined;
        }
      }
    }
  }
  sluit();
  return ketens;
}

// Dun een keten uit tot maximaal `max` punten (gelijkmatig verdeeld).
function dun(punten: XY[], max: number): XY[] {
  if (punten.length <= max) return punten;
  const uit: XY[] = [];
  const stap = (punten.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) uit.push(punten[Math.round(i * stap)]);
  return uit;
}

/**
 * Parse een DXF-tekst en projecteer de grootste lijnketen rond `anker` ([lon,lat]).
 * `doelMeter` = gewenste lengte van de langste zijde van de bounding box.
 * Geeft `null` terug als er geen bruikbare geometrie in zit.
 */
export function dxfNaarTrace(
  tekst: string,
  anker: LngLat,
  doelMeter = 420,
): LngLat[] | null {
  const ketens = haalKetens(leesParen(tekst));
  if (!ketens.length) return null;

  // Kies de langste keten (meeste punten).
  let keten = ketens.sort((a, b) => b.length - a.length)[0];
  keten = dun(keten, 60);
  if (keten.length < 2) return null;

  // Bounding box van de tekening.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of keten) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const breedte = maxX - minX || 1;
  const hoogte = maxY - minY || 1;
  const grootste = Math.max(breedte, hoogte);
  if (!Number.isFinite(grootste) || grootste <= 0) return null;

  // Schaal zodat de langste zijde ≈ doelMeter wordt; centreer op (0,0) in meters.
  const schaal = doelMeter / grootste;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const [ankerLon, ankerLat] = anker;
  const latRad = (ankerLat * Math.PI) / 180;

  return keten.map<LngLat>(([x, y]) => {
    const dxM = (x - cx) * schaal; // oost (+)
    const dyM = (y - cy) * schaal; // noord (+)
    const lon = ankerLon + dxM / (111320 * Math.cos(latRad));
    const lat = ankerLat + dyM / 111320;
    return [lon, lat];
  });
}

/**
 * Gesimuleerd tracé rond `anker` — fallback wanneer er geen DXF-geometrie is,
 * of om puur de demo te tonen. Een licht kronkelende lijn van ~`doelMeter`.
 */
export function gesimuleerdTrace(anker: LngLat, doelMeter = 420): LngLat[] {
  const [ankerLon, ankerLat] = anker;
  const latRad = (ankerLat * Math.PI) / 180;
  const n = 9;
  const punten: LngLat[] = [];
  // Hoofdrichting onder een vaste hoek, met een lichte zig-zag ernaast.
  const hoek = 0.6; // radialen
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const langs = (t - 0.5) * doelMeter; // -L/2 .. +L/2 langs de richting
    const zij = Math.sin(t * Math.PI * 2) * doelMeter * 0.06; // kronkel
    const dxM = langs * Math.cos(hoek) - zij * Math.sin(hoek);
    const dyM = langs * Math.sin(hoek) + zij * Math.cos(hoek);
    const lon = ankerLon + dxM / (111320 * Math.cos(latRad));
    const lat = ankerLat + dyM / 111320;
    punten.push([lon, lat]);
  }
  return punten;
}

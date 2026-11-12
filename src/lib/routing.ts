// Laat een tracé een logische wegroute volgen (OSRM), afgekapt op een lengte,
// met een kleine zijdelingse verschuiving richting de berm. Server-only.
// Wordt gebruikt om tracés op de weg te leggen (niet onder bebouwing).

type LngLat = [number, number];

function haversine(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Kapt de route af op maximaal `max` meter (met interpolatie van het eindpunt). */
function trimTo(coords: LngLat[], max: number): LngLat[] {
  const out: LngLat[] = [coords[0]];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversine(coords[i - 1], coords[i]);
    if (acc + d >= max) {
      const t = (max - acc) / d;
      out.push([
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
      ]);
      return out;
    }
    acc += d;
    out.push(coords[i]);
  }
  return out;
}

/** Verschuift elk punt ~`meters` loodrecht op de rijrichting (naar de berm). */
function offsetBerm(coords: LngLat[], meters: number): LngLat[] {
  if (coords.length < 2) return coords;
  return coords.map((c, i) => {
    const prev = coords[Math.max(0, i - 1)];
    const next = coords[Math.min(coords.length - 1, i + 1)];
    const mLon = 111320 * Math.cos((c[1] * Math.PI) / 180);
    const mLat = 111320;
    let dx = (next[0] - prev[0]) * mLon;
    let dy = (next[1] - prev[1]) * mLat;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // rechter normaal op de richting = (dy, -dx)
    const nx = dy;
    const ny = -dx;
    return [c[0] + (nx * meters) / mLon, c[1] + (ny * meters) / mLat] as LngLat;
  });
}

/** Lichte vereenvoudiging: houd elk n-de punt + eindpunt (minder maar genoeg knikpunten). */
function uitdunnen(coords: LngLat[], stap: number): LngLat[] {
  if (coords.length <= 3) return coords;
  const out: LngLat[] = [];
  for (let i = 0; i < coords.length; i += stap) out.push(coords[i]);
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

/**
 * Haalt een wegroute op tussen de waypoints (OSRM), kapt af op `maxMeters` en
 * verschuift naar de berm. Geeft null terug bij een fout (dan tracé behouden).
 */
export async function volgDeWeg(
  waypoints: LngLat[],
  maxMeters = 520,
  bermOffsetM = 3
): Promise<LngLat[] | null> {
  if (waypoints.length < 2) return null;
  const coordStr = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    const j = await res.json();
    const geom = j?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(geom) || geom.length < 2) return null;
    let coords = geom as LngLat[];
    coords = trimTo(coords, maxMeters);
    coords = uitdunnen(coords, 2);
    if (bermOffsetM) coords = offsetBerm(coords, bermOffsetM);
    return coords;
  } catch {
    return null;
  }
}

/** Bouwt een GeoJSON-Feature (LineString) van coördinaten. */
export function naarTraceGeoJson(coords: LngLat[]): string {
  return JSON.stringify({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
}

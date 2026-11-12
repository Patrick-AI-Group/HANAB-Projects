// Genereert een situatiekaartje: OpenStreetMap-tegels met het tracé erop.
// Levert zowel een zelfstandige SVG (voor HTML, met data-URI-tegels) als
// tegel-buffers + tracé in pixels (voor de PDF). Server-only.

type LngLat = [number, number];

const TILE = 256;
const OSM = "https://tile.openstreetmap.org";
const UA = "HANAB-BMS/1.0 (demo; +https://www.hanab.nl)";

export interface Kaartje {
  width: number;
  height: number;
  svg: string; // zelfstandig, met data-URI-tegels
  tiles: { buf: Buffer; x: number; y: number }[]; // voor pdfkit (doc.image)
  tracePx: [number, number][];
  schaalMeters: number;
  schaalPx: number;
}

function worldX(lon: number, scale: number): number {
  return ((lon + 180) / 360) * scale;
}
function worldY(lat: number, scale: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
}

async function fetchTile(z: number, x: number, y: number): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${OSM}/${z}/${x}/${y}.png`, {
      headers: { "User-Agent": UA, Accept: "image/png" },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function maakKaartje(coords: LngLat[], width = 780, height = 430): Promise<Kaartje | null> {
  if (coords.length < 2) return null;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  // Kies zoom zodat het tracé met marge past.
  let zoom = 18;
  for (let z = 18; z >= 11; z--) {
    const scale = TILE * 2 ** z;
    const spanX = Math.abs(worldX(maxLon, scale) - worldX(minLon, scale));
    const spanY = Math.abs(worldY(maxLat, scale) - worldY(minLat, scale));
    if (spanX <= width - 110 && spanY <= height - 110) {
      zoom = z;
      break;
    }
    zoom = z;
  }

  const scale = TILE * 2 ** zoom;
  const cX = worldX(centerLon, scale);
  const cY = worldY(centerLat, scale);
  const originX = cX - width / 2;
  const originY = cY - height / 2;

  const n = 2 ** zoom;
  const minTX = Math.floor(originX / TILE);
  const maxTX = Math.floor((originX + width) / TILE);
  const minTY = Math.floor(originY / TILE);
  const maxTY = Math.floor((originY + height) / TILE);

  const taken: { tx: number; ty: number; px: number; py: number }[] = [];
  for (let tx = minTX; tx <= maxTX; tx++) {
    for (let ty = minTY; ty <= maxTY; ty++) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      taken.push({ tx, ty, px: tx * TILE - originX, py: ty * TILE - originY });
    }
  }

  const resultaten = await Promise.all(taken.map((t) => fetchTile(zoom, t.tx, t.ty)));
  const tiles: { buf: Buffer; x: number; y: number }[] = [];
  const tileImgs: string[] = [];
  taken.forEach((t, i) => {
    const buf = resultaten[i];
    if (!buf) return;
    tiles.push({ buf, x: t.px, y: t.py });
    tileImgs.push(
      `<image x="${t.px.toFixed(1)}" y="${t.py.toFixed(1)}" width="${TILE}" height="${TILE}" href="data:image/png;base64,${buf.toString("base64")}"/>`
    );
  });
  if (tiles.length === 0) return null;

  const tracePx: [number, number][] = coords.map((c) => [worldX(c[0], scale) - originX, worldY(c[1], scale) - originY]);
  const poly = tracePx.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  // Schaalbalk
  const mPerPx = (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / 2 ** zoom;
  let schaalMeters = 100;
  if (100 / mPerPx > width * 0.4) schaalMeters = 50;
  if (50 / mPerPx > width * 0.4) schaalMeters = 25;
  const schaalPx = schaalMeters / mPerPx;

  const vertices = tracePx
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#fff" stroke="#00214b" stroke-width="2"/>`)
    .join("");

  const sbx = 16, sby = height - 22;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<g>${tileImgs.join("")}</g>` +
    `<polyline points="${poly}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>` +
    `<polyline points="${poly}" fill="none" stroke="#e63223" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    vertices +
    // noordpijl
    `<g transform="translate(${width - 26},26)"><polygon points="0,-13 5,7 0,2 -5,7" fill="#00214b"/><text x="0" y="20" text-anchor="middle" font-family="Arial" font-size="11" font-weight="700" fill="#00214b">N</text></g>` +
    // schaalbalk
    `<g><rect x="${sbx - 4}" y="${sby - 12}" width="${schaalPx + 44}" height="24" fill="#ffffff" opacity="0.8"/>` +
    `<rect x="${sbx}" y="${sby}" width="${schaalPx}" height="5" fill="#00214b"/>` +
    `<text x="${sbx + schaalPx + 6}" y="${sby + 6}" font-family="Arial" font-size="10" fill="#0f172a">${schaalMeters} m</text></g>` +
    // attributie
    `<text x="${width - 6}" y="${height - 6}" text-anchor="end" font-family="Arial" font-size="9" fill="#0f172a" opacity="0.8">© OpenStreetMap-bijdragers</text>` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#cbd5e1"/>` +
    `</svg>`;

  return { width, height, svg, tiles, tracePx, schaalMeters, schaalPx };
}

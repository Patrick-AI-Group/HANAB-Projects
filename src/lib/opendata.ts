// Open-data-bevraging voor het bureauonderzoek.
//
// Haalt, op basis van het ingetekende tracé, gegevens op uit landelijke open
// bronnen (keyless): BRO (sonderingen/CPT, grondwatermonitoring/GMW) en PDOK
// (Natura 2000). Bodem & milieu (Bodemloket) en archeologie zijn niet via een
// publieke keyless API beschikbaar; die worden eerlijk gemarkeerd met een
// verwijzing naar het officiële loket.
//
// Alle requests zijn server-side (deze module nooit in de client importeren).

export interface BronBevinding {
  thema: string;
  bron: string;
  beschikbaar: boolean;
  aantal?: number;
  samenvatting: string;
  url?: string;
}

export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

// --- Geometrie --------------------------------------------------------------

/** Haalt [lon,lat]-paren uit een GeoJSON (Feature/Geometry LineString). */
export function traceCoords(geojson: string | null | undefined): [number, number][] {
  if (!geojson) return [];
  try {
    const g = JSON.parse(geojson);
    const geom = g.type === "Feature" ? g.geometry : g.type === "FeatureCollection" ? g.features?.[0]?.geometry : g;
    const c = geom?.coordinates;
    if (!Array.isArray(c)) return [];
    if (geom.type === "MultiLineString") return c.flat().filter(paar);
    return c.filter(paar) as [number, number][];
  } catch {
    return [];
  }
}
function paar(x: unknown): x is [number, number] {
  return Array.isArray(x) && x.length >= 2 && typeof x[0] === "number" && typeof x[1] === "number";
}

export function traceBbox(coords: [number, number][], bufferDeg = 0.003): Bbox | null {
  if (coords.length === 0) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return {
    minLon: minLon - bufferDeg,
    minLat: minLat - bufferDeg,
    maxLon: maxLon + bufferDeg,
    maxLat: maxLat + bufferDeg,
  };
}

/** Tracélengte in meters (haversine over de vertices). */
export function traceLengteMeter(coords: [number, number][]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    m += 2 * R * Math.asin(Math.sqrt(a));
  }
  return Math.round(m);
}

// --- Fetch-helper -----------------------------------------------------------

async function fetchMetTimeout(url: string, opts: RequestInit = {}, ms = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// --- Bronnen ----------------------------------------------------------------

async function broAantal(basis: string, bb: Bbox): Promise<number> {
  const res = await fetchMetTimeout(
    `${basis}/characteristics/searches?requestReference=hanab-bms`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/xml" },
      body: JSON.stringify({
        area: {
          boundingBox: {
            lowerCorner: { lat: bb.minLat, lon: bb.minLon },
            upperCorner: { lat: bb.maxLat, lon: bb.maxLon },
          },
        },
      }),
    },
    25000
  );
  if (!res.ok) throw new Error(`BRO ${res.status}`);
  const xml = await res.text();
  const ids = xml.match(/<[\w:]*broId>[^<]+<\/[\w:]*broId>/g) || [];
  return ids.length;
}

async function geotechniek(bb: Bbox): Promise<BronBevinding> {
  const basis = "https://publiek.broservices.nl/sr/cpt/v1";
  try {
    const n = await broAantal(basis, bb);
    return {
      thema: "Geotechniek",
      bron: "BRO — Sonderingen (CPT)",
      beschikbaar: true,
      aantal: n,
      samenvatting:
        n > 0
          ? `${n} bestaande sondering(en) (CPT) in de omgeving van het tracé. Bruikbaar voor een eerste beeld van de bodemopbouw; mogelijk zijn aanvullende sonderingen nodig bij boringen/persingen.`
          : "Geen bestaande sonderingen in de directe omgeving gevonden — reken op nieuw geotechnisch onderzoek bij boringen.",
      url: "https://www.broloket.nl/ondergrondgegevens",
    };
  } catch {
    return onbeschikbaar("Geotechniek", "BRO — Sonderingen (CPT)", "https://www.broloket.nl/ondergrondgegevens");
  }
}

async function water(bb: Bbox): Promise<BronBevinding> {
  const basis = "https://publiek.broservices.nl/gm/gmw/v1";
  try {
    const n = await broAantal(basis, bb);
    return {
      thema: "Water",
      bron: "BRO — Grondwatermonitoringputten (GMW)",
      beschikbaar: true,
      aantal: n,
      samenvatting:
        n > 0
          ? `${n} grondwatermonitoringput(ten) in de omgeving. Geeft inzicht in grondwaterstanden t.b.v. bemalingsadvies en watervergunning.`
          : "Geen grondwatermonitoringputten in de directe omgeving — bemalingsadvies op basis van nieuw veldonderzoek.",
      url: "https://www.broloket.nl/ondergrondgegevens",
    };
  } catch {
    return onbeschikbaar("Water", "BRO — Grondwatermonitoringputten (GMW)", "https://www.broloket.nl/ondergrondgegevens");
  }
}

async function natuur(bb: Bbox): Promise<BronBevinding> {
  try {
    const url = `https://api.pdok.nl/rvo/natura2000/ogc/v1/collections/natura2000/items?bbox=${bb.minLon},${bb.minLat},${bb.maxLon},${bb.maxLat}&limit=50&f=json`;
    const res = await fetchMetTimeout(url, { headers: { Accept: "application/json" } }, 20000);
    if (!res.ok) throw new Error(`PDOK ${res.status}`);
    const j = await res.json();
    const feats: any[] = j.features ?? [];
    const namen = new Set<string>();
    for (const f of feats) {
      const p = f.properties ?? {};
      for (const [k, v] of Object.entries(p)) {
        if (/naam/i.test(k) && typeof v === "string" && v.trim()) namen.add(v.trim());
      }
    }
    const lijst = [...namen].slice(0, 3);
    return {
      thema: "Natuur",
      bron: "PDOK — Natura 2000",
      beschikbaar: true,
      aantal: feats.length,
      samenvatting:
        feats.length > 0
          ? `Natura 2000-gebied in/nabij het tracé${lijst.length ? `: ${lijst.join(", ")}` : ""}. Toets op stikstof/verstoring en Wet natuurbescherming is vereist.`
          : "Geen Natura 2000-gebied in de directe omgeving. Een quickscan Wet natuurbescherming (beschermde soorten) blijft doorgaans wel nodig.",
      url: "https://www.nationaalgeoregister.nl/",
    };
  } catch {
    return onbeschikbaar("Natuur", "PDOK — Natura 2000", "https://www.nationaalgeoregister.nl/");
  }
}

/** Kiest begin-, midden- en eindpunt van het tracé voor puntbevragingen. */
function kiesPunten(coords: [number, number][]): [number, number][] {
  if (coords.length === 0) return [];
  if (coords.length <= 3) return coords;
  return [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]];
}

/** WMS GetFeatureInfo (JSON) op één punt. */
async function getFeatureInfoJson(base: string, layer: string, lon: number, lat: number): Promise<any[]> {
  const dLat = 0.0006;
  const dLon = 0.0009;
  // WMS 1.3.0 met EPSG:4326 verwacht bbox in volgorde lat,lon (min,min,max,max).
  const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}`;
  const u =
    `${base}?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=${layer}&query_layers=${layer}` +
    `&styles=&crs=EPSG:4326&bbox=${bbox}&width=101&height=101&i=50&j=50&info_format=application/json`;
  const res = await fetchMetTimeout(u, { headers: { Accept: "application/json" } }, 15000);
  if (!res.ok) throw new Error(`WMS ${res.status}`);
  const j = await res.json();
  return Array.isArray(j.features) ? j.features : [];
}

async function bodem(coords: [number, number][]): Promise<BronBevinding> {
  // De BRO Bodemkaart is een raadpleegbare open laag (ook als kaartoverlay);
  // we bevragen puntsgewijs. Faalt een punt, dan slaan we het over — de bron
  // blijft beschikbaar.
  const namen = new Set<string>();
  for (const [lon, lat] of kiesPunten(coords)) {
    try {
      const feats = await getFeatureInfoJson(
        "https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0",
        "soilarea",
        lon,
        lat
      );
      for (const f of feats) {
        const p = f.properties ?? {};
        for (const [k, v] of Object.entries(p)) {
          if (/soil|bodem|naam|omschrij|profiel|kaarteenh/i.test(k) && typeof v === "string" && v.trim() && v.length < 90) {
            namen.add(v.trim());
          }
        }
      }
    } catch {
      /* dit punt overslaan */
    }
  }
  const lijst = [...namen].slice(0, 4);
  return {
    thema: "Bodem & milieu",
    bron: "BRO Bodemkaart (PDOK)",
    beschikbaar: true,
    aantal: lijst.length,
    samenvatting: lijst.length
      ? `Bodemeenheid langs het tracé: ${lijst.join("; ")}. Combineer met historisch milieuonderzoek (Bodemloket) en plan een verkennend bodemonderzoek (NEN 5740).`
      : "Bodemkaart (BRO) is beschikbaar als kaartlaag; op de tracépunten is geen specifieke kaarteenheid opgehaald (vaak bebouwd gebied). Plan een verkennend milieukundig bodemonderzoek (NEN 5740) en raadpleeg Bodemloket.",
    url: "https://www.bodemloket.nl/",
  };
}

function archeologie(): BronBevinding {
  return {
    thema: "Archeologie",
    bron: "Gemeentelijke beleidskaart / RCE (handmatig)",
    beschikbaar: false,
    samenvatting:
      "Archeologische verwachting niet via open API opgehaald. Toets de gemeentelijke archeologische beleidskaart; bij (middel)hoge verwachting is een bureauonderzoek/booronderzoek (KNA) nodig.",
    url: "https://www.cultureelerfgoed.nl/onderwerpen/archeologie",
  };
}

function onbeschikbaar(thema: string, bron: string, url: string): BronBevinding {
  return {
    thema,
    bron,
    beschikbaar: false,
    samenvatting: "Bron was tijdens het bureauonderzoek niet bereikbaar (offline of tijdelijke storing). Controleer handmatig.",
    url,
  };
}

/** Voert het volledige bureauonderzoek uit op basis van het tracé. */
export async function haalBevindingen(geojson: string): Promise<BronBevinding[]> {
  const coords = traceCoords(geojson);
  const bb = traceBbox(coords);
  if (!bb) return [];
  const [bod, geo, wat, nat] = await Promise.allSettled([
    bodem(coords),
    geotechniek(bb),
    water(bb),
    natuur(bb),
  ]);
  const uit = (r: PromiseSettledResult<BronBevinding>, fb: BronBevinding) =>
    r.status === "fulfilled" ? r.value : fb;
  return [
    uit(bod, onbeschikbaar("Bodem & milieu", "BRO Bodemkaart (PDOK)", "https://www.bodemloket.nl/")),
    archeologie(),
    uit(nat, onbeschikbaar("Natuur", "PDOK — Natura 2000", "")),
    uit(geo, onbeschikbaar("Geotechniek", "BRO — Sonderingen (CPT)", "")),
    uit(wat, onbeschikbaar("Water", "BRO — Grondwatermonitoringputten (GMW)", "")),
  ];
}

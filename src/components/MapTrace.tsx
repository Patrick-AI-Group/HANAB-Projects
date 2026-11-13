"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { opslaanTrace } from "@/app/actions";
import { dxfNaarTrace, gesimuleerdTrace } from "@/lib/dxf";
import { klicKabels, ceGebieden, archeologie, bomen } from "@/lib/datalagen";

type LngLat = [number, number]; // [lon, lat] — GeoJSON-volgorde

function lengteMeter(pts: LngLat[]): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const [lon1, lat1] = pts[i - 1];
    const [lon2, lat2] = pts[i];
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

export function MapTrace({
  projectId,
  initialTrace,
}: {
  projectId: string;
  initialTrace: string | null;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const drawingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Gesimuleerde datalagen (demo) — groepen die meebewegen met het tracé.
  const klicRef = useRef<any>(null);
  const ceRef = useRef<any>(null);
  const archRef = useRef<any>(null);
  const bomenRef = useRef<any>(null);

  const [pts, setPts] = useState<LngLat[]>([]);
  const [tekenen, setTekenen] = useState(false);
  const [klaar, setKlaar] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);

  // Init kaart (één keer)
  useEffect(() => {
    let afgebroken = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (afgebroken || !divRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(divRef.current, { center: [52.15, 5.38], zoom: 8 });

      // Achtergrondkaart (OSM — betrouwbaar) + luchtfoto-optie (PDOK)
      const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap-bijdragers",
      }).addTo(map);
      const luchtfoto = L.tileLayer.wms("https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0", {
        layers: "Actueel_orthoHR",
        format: "image/jpeg",
        attribution: "PDOK Luchtfoto",
      });

      // Echte milieu-/ondergrondlagen (PDOK WMS-overlays)
      const natura = L.tileLayer.wms("https://service.pdok.nl/rvo/natura2000/wms/v1_0", {
        layers: "natura2000",
        format: "image/png",
        transparent: true,
        opacity: 0.55,
        attribution: "PDOK Natura 2000",
      });
      const bodem = L.tileLayer.wms("https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0", {
        layers: "soilarea",
        format: "image/png",
        transparent: true,
        opacity: 0.55,
        attribution: "PDOK/BRO Bodemkaart",
      });
      const percelen = L.tileLayer.wms("https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0", {
        layers: "Kadastralekaart",
        format: "image/png",
        transparent: true,
        opacity: 0.8,
        attribution: "PDOK/Kadaster — Kadastrale kaart",
      });
      const hoogte = L.tileLayer.wms("https://service.pdok.nl/rws/ahn/wms/v1_0", {
        layers: "dtm_05m",
        format: "image/png",
        transparent: true,
        opacity: 0.6,
        attribution: "PDOK/RWS — AHN hoogte (maaiveld)",
      });

      // Gesimuleerde HANAB-lagen (demo) — gevuld in het punten-effect.
      klicRef.current = L.layerGroup();
      ceRef.current = L.layerGroup();
      archRef.current = L.layerGroup();
      bomenRef.current = L.layerGroup();
      // KLIC standaard zichtbaar: kabels & leidingen zijn de kern van het werk.
      klicRef.current.addTo(map);

      L.control
        .layers(
          { "OpenStreetMap": osm, "Luchtfoto (PDOK)": luchtfoto },
          {
            "KLIC — kabels & leidingen (demo)": klicRef.current,
            "Niet-gesprongen explosieven (demo)": ceRef.current,
            "Archeologische verwachting (demo)": archRef.current,
            "Bomen / boomregister (demo)": bomenRef.current,
            "Kadastrale percelen (PDOK)": percelen,
            "Hoogte AHN (PDOK)": hoogte,
            "Natura 2000 (PDOK)": natura,
            "Bodemkaart BRO (PDOK)": bodem,
          },
          { collapsed: false }
        )
        .addTo(map);

      lineRef.current = L.polyline([], { color: "#e63223", weight: 4 }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);

      map.on("click", (e: any) => {
        if (!drawingRef.current) return;
        const p: LngLat = [e.latlng.lng, e.latlng.lat];
        setPts((prev) => [...prev, p]);
      });

      mapRef.current = map;

      // Bestaand tracé inladen
      let start: LngLat[] = [];
      if (initialTrace) {
        try {
          const g = JSON.parse(initialTrace);
          const geom = g.type === "Feature" ? g.geometry : g;
          if (Array.isArray(geom?.coordinates)) start = geom.coordinates;
        } catch {
          /* negeer */
        }
      }
      if (start.length >= 2) {
        setPts(start);
        map.fitBounds(start.map(([lon, lat]) => [lat, lon]) as any, { padding: [40, 40] });
      }
      setKlaar(true);
    })();

    return () => {
      afgebroken = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Teken-mode spiegelen naar ref + cursor
  useEffect(() => {
    drawingRef.current = tekenen;
    if (mapRef.current) {
      mapRef.current.getContainer().style.cursor = tekenen ? "crosshair" : "";
    }
  }, [tekenen]);

  // Lijn + markers hertekenen bij wijziging punten
  useEffect(() => {
    const L = LRef.current;
    if (!L || !lineRef.current || !markersRef.current) return;
    lineRef.current.setLatLngs(pts.map(([lon, lat]) => [lat, lon]));
    markersRef.current.clearLayers();
    pts.forEach(([lon, lat], i) => {
      L.circleMarker([lat, lon], {
        radius: 4,
        color: "#00214b",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(String(i + 1), { permanent: false })
        .addTo(markersRef.current);
    });
  }, [pts]);

  // Gesimuleerde datalagen opnieuw opbouwen bij elke tracé-wijziging.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !klicRef.current) return;

    const c = map.getCenter?.();
    const center: [number, number] = c ? [c.lng, c.lat] : [5.38, 52.15];
    const xy = ([lon, lat]: [number, number]) => [lat, lon] as [number, number];

    // KLIC — kabels & leidingen
    klicRef.current.clearLayers();
    klicKabels(pts, center).forEach((f) => {
      L.polyline(f.coords.map(xy), {
        color: f.kleur,
        weight: f.dik,
        opacity: 0.95,
        dashArray: f.dash,
      })
        .bindTooltip(f.label, { sticky: true })
        .addTo(klicRef.current);
    });

    // CE — niet-gesprongen explosieven
    ceRef.current.clearLayers();
    ceGebieden(pts, center).forEach((f) => {
      L.polygon(f.ring.map(xy), {
        color: f.kleur,
        weight: 2,
        dashArray: "6 4",
        fillColor: f.kleur,
        fillOpacity: f.opacity ?? 0.2,
      })
        .bindTooltip(f.label, { sticky: true })
        .addTo(ceRef.current);
    });

    // Archeologische verwachting
    archRef.current.clearLayers();
    archeologie(pts, center).forEach((f) => {
      L.polygon(f.ring.map(xy), {
        color: f.kleur,
        weight: 1,
        fillColor: f.kleur,
        fillOpacity: f.opacity ?? 0.25,
      })
        .bindTooltip(f.label, { sticky: true })
        .addTo(archRef.current);
    });

    // Bomen
    bomenRef.current.clearLayers();
    bomen(pts, center).forEach((f) => {
      L.circleMarker(xy(f.punt), {
        radius: f.radius ?? 5,
        color: "#14532d",
        weight: 1,
        fillColor: f.kleur,
        fillOpacity: 0.9,
      })
        .bindTooltip(f.label, { sticky: true })
        .addTo(bomenRef.current);
    });
  }, [pts, klaar]);

  const geo = JSON.stringify({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: pts },
  });
  const lengte = lengteMeter(pts);

  // Plaats een ingelezen tracé op de kaart en zoom ernaartoe.
  function zetTrace(nieuw: LngLat[]) {
    setTekenen(false);
    setPts(nieuw);
    const map = mapRef.current;
    if (map && nieuw.length >= 2) {
      map.fitBounds(nieuw.map(([lon, lat]) => [lat, lon]) as any, { padding: [40, 40] });
    }
  }

  // Huidig kaartmidden als ankerpunt voor de projectie (fallback NL-midden).
  function anker(): LngLat {
    const c = mapRef.current?.getCenter?.();
    return c ? [c.lng, c.lat] : [5.38, 52.15];
  }

  // DXF-upload (demo): lees de tekening, haal de lijnketen eruit en leg die op
  // de kaart. Lukt parsen niet, dan een gesimuleerd tracé — zo werkt de demo altijd.
  async function onDxf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // zelfde bestand opnieuw kunnen kiezen
    if (!file) return;
    try {
      const tekst = await file.text();
      const uitDxf = dxfNaarTrace(tekst, anker());
      if (uitDxf && uitDxf.length >= 2) {
        zetTrace(uitDxf);
        setUploadInfo(`Tracé uit ${file.name} ingelezen (${uitDxf.length} punten, gesimuleerde demo).`);
        return;
      }
      zetTrace(gesimuleerdTrace(anker()));
      setUploadInfo(`Geen leesbare geometrie in ${file.name}; gesimuleerd tracé geplaatst (demo).`);
    } catch {
      zetTrace(gesimuleerdTrace(anker()));
      setUploadInfo("DXF kon niet gelezen worden; gesimuleerd tracé geplaatst (demo).");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTekenen((v) => !v)}
          className={tekenen ? "btn-accent" : "btn-primary"}
        >
          {tekenen ? "✏️ Tekenen aan — klik op de kaart" : "✏️ Tracé tekenen"}
        </button>
        <button
          type="button"
          onClick={() => setPts((p) => p.slice(0, -1))}
          disabled={pts.length === 0}
          className="btn-ghost"
        >
          Laatste punt terug
        </button>
        <button type="button" onClick={() => setPts([])} disabled={pts.length === 0} className="btn-ghost">
          Wissen
        </button>

        <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden />

        <input
          ref={fileRef}
          type="file"
          accept=".dxf,application/dxf,image/vnd.dxf"
          onChange={onDxf}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-ghost"
          title="Lees een tracé in uit een DXF-tekening (demo — gesimuleerd)"
        >
          ⬆️ DXF uploaden
        </button>

        <span className="ml-auto text-sm text-slate-600">
          {pts.length} punten · <strong>{lengte} m</strong>
        </span>
      </div>

      {uploadInfo && (
        <p className="rounded-lg bg-hanab-light/40 px-3 py-2 text-xs text-hanab-900 ring-1 ring-hanab-900/15">
          {uploadInfo}
        </p>
      )}

      <div
        ref={divRef}
        className="h-[460px] w-full overflow-hidden rounded-xl ring-1 ring-slate-300"
        style={{ background: "#dfe7ef" }}
      />
      {!klaar && <p className="text-xs text-slate-400">Kaart laden… (vereist internetverbinding voor de PDOK-achtergrondkaart)</p>}

      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
        <div className="mb-1 font-semibold text-slate-700">
          KLIC — kabels & leidingen <span className="font-normal text-slate-400">(gesimuleerde demo-data)</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            ["#d81e1e", "Elektra LS"],
            ["#b11fd8", "Elektra MS"],
            ["#f2b705", "Gas"],
            ["#1f6fd6", "Drinkwater"],
            ["#ff8c1a", "Telecom/data"],
            ["#7a5230", "Riool"],
          ].map(([kleur, naam]) => (
            <span key={naam} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 rounded" style={{ background: kleur }} />
              {naam}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-slate-400">
          Extra lagen via het lagenpaneel rechtsboven: explosieven, archeologie, bomen (gesimuleerd) ·
          percelen, hoogte, Natura 2000, bodem (echte PDOK-data).
        </p>
      </div>

      <form action={opslaanTrace} className="flex items-center gap-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="trace" value={geo} />
        <button type="submit" disabled={pts.length < 2} className="btn-primary">
          Tracé opslaan
        </button>
        <span className="text-xs text-slate-500">
          Teken minimaal 2 punten en sla op; daarna kun je het bureauonderzoek genereren.
        </span>
      </form>
    </div>
  );
}

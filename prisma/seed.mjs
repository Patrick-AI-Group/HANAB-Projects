import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// --- Hulpfuncties -----------------------------------------------------------

const d = (s) => new Date(s);

/** Bouwt een GeoJSON-Feature (LineString) uit [lon,lat]-paren. */
function trace(punten) {
  return JSON.stringify({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: punten },
  });
}

// --- Wegroutering (OSRM) + bermverschuiving (gelijk aan src/lib/routing.ts) ---

function haversine(a, b) {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function trimTo(coords, max) {
  const out = [coords[0]];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const dist = haversine(coords[i - 1], coords[i]);
    if (acc + dist >= max) {
      const t = (max - acc) / dist;
      out.push([
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
      ]);
      return out;
    }
    acc += dist;
    out.push(coords[i]);
  }
  return out;
}

function offsetBerm(coords, meters) {
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
    const nx = dy;
    const ny = -dx;
    return [c[0] + (nx * meters) / mLon, c[1] + (ny * meters) / mLat];
  });
}

function uitdunnen(coords, stap) {
  if (coords.length <= 3) return coords;
  const out = [];
  for (let i = 0; i < coords.length; i += stap) out.push(coords[i]);
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

/** Route langs de weg (OSRM), afgekapt op `maxMeters`, verschoven naar de berm. */
async function volgDeWeg(waypoints, maxMeters = 520, bermOffsetM = 3) {
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
    let coords = trimTo(geom, maxMeters);
    coords = uitdunnen(coords, 2);
    if (bermOffsetM) coords = offsetBerm(coords, bermOffsetM);
    return coords;
  } catch {
    return null;
  }
}

/** Probeert een realistisch, wegvolgend tracé (berm); valt terug op `fallback`. */
async function wegTrace(waypoints, lengteM, fallback) {
  const coords = await volgDeWeg(waypoints, lengteM, 3);
  if (coords && coords.length >= 2) {
    console.log(`  tracé via weg/berm: ${coords.length} knikpunten, ~${lengteM} m`);
    return trace(coords);
  }
  console.log("  OSRM niet beschikbaar — terugval op handmatig tracé");
  return trace(fallback);
}

/** Onderzoeksrapport-HTML (zelfde opmaak als de AI genereert). */
function klicRapportHtml(naam, plaats, lengte) {
  return `<h2>1. Aanleiding en doel</h2>
<p>In het kader van het project <strong>${naam}</strong> te ${plaats} worden over een tracélengte van circa ${lengte} m graafwerkzaamheden uitgevoerd. Conform de <strong>WIBON</strong> is voorafgaand aan mechanisch grondroeren een graafmelding (KLIC) bij het Kadaster verplicht. Doel is het volledig in beeld brengen van de aanwezige kabels en leidingen ter voorkoming van graafschade en ter borging van een zorgvuldig graafproces volgens <strong>CROW 500</strong>.</p>
<h2>2. Project- en tracégegevens</h2>
<table><tbody>
<tr><th>Project</th><td>${naam}</td></tr>
<tr><th>Locatie</th><td>${plaats}</td></tr>
<tr><th>Tracélengte</th><td>ca. ${lengte} m</td></tr>
<tr><th>Graafmelding</th><td>Oriëntatieverzoek + graafmelding ingediend</td></tr>
</tbody></table>
<h2>3. Onderzoeksopzet en normkader</h2>
<p>De melding is ingediend via het KLIC-portaal (Mijn Kadaster). De ontvangen liggingsgegevens zijn verwerkt tot een gecombineerde GIS-overlay. Toetsing vindt plaats aan CROW 500 (zorgvuldig graafproces) en, voor kruisingen met hoofdtransportleidingen, aan <strong>NEN 3650/3651</strong>.</p>
<h2>4. Resultaten en bevindingen</h2>
<table><thead><tr><th>Netbeheerder</th><th>Net</th><th>Aandachtspunt</th></tr></thead><tbody>
<tr><td>Liander</td><td>LS/MS-elektra</td><td>Parallelligging, proefsleuven bij kruisingen</td></tr>
<tr><td>Vitens</td><td>Drinkwater</td><td>Bestaande AC-leiding, asbestprotocol</td></tr>
<tr><td>KPN / VodafoneZiggo</td><td>Telecom</td><td>Ondiepe ligging, handmatig ontgraven</td></tr>
<tr><td>Stedin Gas</td><td>Lagedruk gas</td><td>CROW 500 risicoklasse verhoogd</td></tr>
</tbody></table>
<h2>5. Risico's en aandachtspunten</h2>
<ul>
<li>Afwijkende ligging telecom: handmatig ontgraven binnen 1,5 m.</li>
<li>Asbestverdachte AC-waterleiding: werken conform NTA 8017 en asbestprotocol.</li>
<li>Geldigheidstermijn graafmelding (20 werkdagen) bewaken t.o.v. startdatum.</li>
</ul>
<h2>6. Conclusie en advies</h2>
<p>Het tracé is uitvoerbaar mits de kruisingen met gas en MS-elektra via proefsleuven worden gelokaliseerd en het asbestprotocol wordt gevolgd. Wij adviseren een gecombineerde ligging-tekening op te nemen in het werkplan.</p>
<h2>7. Vervolgstappen en planning</h2>
<ul>
<li>Proefsleuven graven bij de vier kruisingen vóór start hoofdtracé.</li>
<li>Gecombineerde liggingstekening toevoegen aan het uitvoeringsdossier.</li>
<li>Graafmelding vernieuwen indien start &gt; 20 werkdagen na melding.</li>
</ul>`;
}

function bodemRapportHtml(naam, plaats) {
  return `<h2>1. Aanleiding en doel</h2>
<p>Voor project <strong>${naam}</strong> te ${plaats} is een verkennend milieukundig bodemonderzoek conform <strong>NEN 5740</strong> uitgevoerd om de milieuhygiënische kwaliteit van grond en grondwater vast te stellen en de hergebruiksmogelijkheden van vrijkomende grond te bepalen.</p>
<h2>2. Project- en tracégegevens</h2>
<table><tbody>
<tr><th>Onderzoekstype</th><td>Verkennend bodemonderzoek (NEN 5740)</td></tr>
<tr><th>Strategie</th><td>Onverdachte locatie met lijnvormig tracé</td></tr>
<tr><th>Uitvoerder</th><td>Ortageo Noordoost B.V.</td></tr>
</tbody></table>
<h2>3. Onderzoeksopzet en normkader</h2>
<p>Er zijn boringen verricht verdeeld over het tracé, met peilbuizen voor grondwaterbemonstering. Analyse op het standaardpakket (zware metalen, PAK, minerale olie, PCB) is uitgevoerd conform NEN 5740; toetsing aan de <strong>Regeling bodemkwaliteit</strong> en het <strong>Besluit bodemkwaliteit</strong>.</p>
<h2>4. Resultaten en bevindingen</h2>
<ul>
<li>Bovengrond: plaatselijk lichte bijmengingen met baksteen; maximaal licht verhoogde gehalten PAK en lood.</li>
<li>Ondergrond: geen verhoogde gehalten boven de achtergrondwaarde.</li>
<li>Grondwater: licht verhoogd barium (van nature voorkomend in de regio).</li>
</ul>
<h2>5. Risico's en aandachtspunten</h2>
<ul>
<li>Vrijkomende bovengrond is indicatief klasse Wonen/Industrie; keuring (AP04) vereist bij afvoer.</li>
<li>Bij graafwerk in de verontreinigde bovenlaag geldt veiligheidsklasse basishygiëne (CROW 400).</li>
</ul>
<h2>6. Conclusie en advies</h2>
<p>De milieuhygiënische kwaliteit vormt geen belemmering voor de voorgenomen werkzaamheden. Vrijkomende grond kan naar verwachting binnen het werk worden hergebruikt; afvoer naar erkende verwerker alleen na AP04-keuring.</p>
<h2>7. Vervolgstappen en planning</h2>
<ul>
<li>Grondstromenplan opstellen vóór uitvoering.</li>
<li>AP04-keuring inplannen voor af te voeren partijen.</li>
<li>Veiligheids- en gezondheidsplan (CROW 400) actualiseren.</li>
</ul>`;
}

function bureauRapportHtml(naam, plaats, lengte) {
  return `<h2>1. Samenvatting</h2>
<p>Dit bureauonderzoek brengt op basis van openbare bronnen (PDOK, BRO, Natura 2000, gemeentelijke beleidskaarten) de conditionerende aspecten langs het tracé van <strong>${naam}</strong> te ${plaats} (ca. ${lengte} m) in beeld. Er zijn geen onoverkomelijke belemmeringen; wel aandachtspunten rond archeologie, een nabijgelegen Natura 2000-gebied en een verhoogde kans op ontplofbare oorlogsresten (OO).</p>
<h2>2. Bodem en geohydrologie</h2>
<p>Volgens de BRO-bodemkaart bestaat de ondergrond overwegend uit zandige afzettingen met een gemiddelde grondwaterstand van circa 1,2 m -mv. Dit is gunstig voor sleufbemaling; een melding/vergunning Waterwet kan nodig zijn afhankelijk van het onttrekkingsdebiet.</p>
<h2>3. Natuur</h2>
<p>Het tracé ligt op circa 600 m van een Natura 2000-gebied. Externe werking (met name stikstofdepositie) dient met een AERIUS-berekening te worden uitgesloten. Voor beschermde soorten is een quickscan Wet natuurbescherming aanbevolen.</p>
<h2>4. Archeologie en OO</h2>
<ul>
<li>Gemeentelijke archeologische beleidskaart: middelhoge verwachting — booronderzoek bij ontgravingen dieper dan 50 cm.</li>
<li>Risicokaart niet-gesprongen explosieven: deels verdacht gebied (frontlinie 1944-1945) — detectieonderzoek aanbevolen vóór grondroering.</li>
</ul>
<h2>5. Kabels, leidingen en verharding</h2>
<p>Op basis van de oriëntatie zijn meerdere netbeheerders aanwezig (elektra, water, gas, telecom). De rijbaan is asfaltverharding; herstel conform gemeentelijke eisen en CROW.</p>
<h2>6. Conclusie en advies</h2>
<ul>
<li>AERIUS-berekening en quickscan natuur uitvoeren.</li>
<li>Detectieonderzoek OO en archeologisch booronderzoek inplannen.</li>
<li>KLIC-melding en proefsleuven bij kruisingen.</li>
</ul>`;
}

const bevindingen = (extra = []) =>
  JSON.stringify([
    { thema: "Bodem (BRO)", aantal: 3, samenvatting: "Zandige ondergrond, GHG ca. 1,2 m -mv; gunstig voor bemaling." },
    { thema: "Natura 2000", aantal: 1, samenvatting: "Gebied op ~600 m; AERIUS-stikstofberekening vereist." },
    { thema: "Archeologie", aantal: 2, samenvatting: "Middelhoge verwachting; booronderzoek bij graafwerk > 50 cm." },
    { thema: "Ontplofbare oorlogsresten", aantal: 1, samenvatting: "Deels verdacht gebied; detectieonderzoek aanbevolen." },
    { thema: "Kabels & leidingen", aantal: 5, samenvatting: "Elektra, water, gas en telecom aanwezig langs het tracé." },
    ...extra,
  ]);

// --- Seed -------------------------------------------------------------------

async function main() {
  // Volledig schoon herseeden.
  await prisma.weekproductieRegel.deleteMany();
  await prisma.weekproductie.deleteMany();
  await prisma.deelbetaling.deleteMany();
  await prisma.deelrevisie.deleteMany();
  await prisma.materiaalRegel.deleteMany();
  await prisma.vocaRegel.deleteMany();
  await prisma.werktekening.deleteMany();
  await prisma.bureauonderzoek.deleteMany();
  await prisma.activiteit.deleteMany();
  await prisma.document.deleteMany();
  await prisma.conditionerendOnderzoek.deleteMany();
  await prisma.project.deleteMany();

  // ======================================================================
  // PROJECT 1 — Vlaggenschip: COMBI, in REVISIE, ALLE producten uitgewerkt
  // ======================================================================
  const traceA = await wegTrace(
    [
      [5.3689, 52.1567],
      [5.3875, 52.1489],
    ],
    850,
    [
      [5.37285, 52.1561],
      [5.37489, 52.15547],
      [5.37712, 52.15503],
      [5.37934, 52.15466],
      [5.38167, 52.15438],
      [5.38401, 52.15402],
      [5.38622, 52.15361],
    ]
  );

  const p1 = await prisma.project.create({
    data: {
      projectnummer: "HNB-2026-001",
      naam: "Aanleg MS-kabel en drinkwaterleiding Stationskwartier",
      opdrachtgever: "Liander & Vitens",
      type: "COMBI",
      plaats: "Amersfoort",
      omschrijving:
        "Gecombineerde aanleg van een 10 kV MS-kabel en een Ø200 PE-drinkwaterleiding over ca. 850 m in de openbare rijbaan, inclusief 4 kruisingen en huisaansluitingen.",
      status: "REVISIE",
      startdatum: d("2026-03-02"),
      opleverdatum: d("2026-10-30"),
      traceGeoJson: traceA,
    },
  });

  // Onderzoeken zonder rapport (nested).
  await prisma.conditionerendOnderzoek.createMany({
    data: [
      { projectId: p1.id, type: "NGE", titel: "Detectieonderzoek ontplofbare oorlogsresten", status: "ONTVANGEN", uitvoerder: "REASeuro", aanvraagdatum: d("2026-01-12"), ontvangstdatum: d("2026-02-06"), referentie: "RE-2026-0412", kosten: 18500, verplicht: true, aiRationale: "Tracé ligt in deels verdacht gebied (frontlinie 1944-1945)." },
      { projectId: p1.id, type: "FLORA_FAUNA", titel: "Quickscan Wet natuurbescherming", status: "BEOORDEELD", uitvoerder: "Eelerwoude", aanvraagdatum: d("2026-01-15"), ontvangstdatum: d("2026-02-20"), referentie: "EW-25.431", kosten: 4200, verplicht: true, aiRationale: "Natura 2000-gebied op ~600 m; externe werking toetsen." },
      { projectId: p1.id, type: "GEOTECHNIEK", titel: "Sonderingen t.b.v. sleuf- en persput", status: "ONTVANGEN", uitvoerder: "Wiertsema & Partners", aanvraagdatum: d("2026-01-20"), ontvangstdatum: d("2026-02-18"), referentie: "WP-0266231", kosten: 6900, verplicht: false },
      { projectId: p1.id, type: "VERHARDING", titel: "Verhardingsonderzoek asfaltrijbaan", status: "BEOORDEELD", uitvoerder: "Kiwa KOAC", aanvraagdatum: d("2026-01-22"), ontvangstdatum: d("2026-02-12"), kosten: 3100, verplicht: false },
    ],
  });

  // Onderzoeken MÉT rapport (individueel, zodat rapportPad met id kan).
  const klic = await prisma.conditionerendOnderzoek.create({
    data: {
      projectId: p1.id, type: "KLIC", titel: "KLIC-melding tracé Stationskwartier", status: "ONTVANGEN",
      uitvoerder: "Kadaster", aanvraagdatum: d("2026-02-02"), ontvangstdatum: d("2026-02-04"),
      referentie: "26G0412765", verplicht: true,
      rapport: klicRapportHtml(p1.naam, p1.plaats, 850), rapportBron: "claude",
    },
  });
  await prisma.conditionerendOnderzoek.update({ where: { id: klic.id }, data: { rapportPad: `/api/rapport/onderzoek/${klic.id}/view` } });

  const bodem = await prisma.conditionerendOnderzoek.create({
    data: {
      projectId: p1.id, type: "BODEM_MILIEU", titel: "Verkennend milieukundig bodemonderzoek (NEN 5740)", status: "BEOORDEELD",
      uitvoerder: "Ortageo Noordoost B.V.", aanvraagdatum: d("2026-01-10"), ontvangstdatum: d("2026-02-09"),
      referentie: "216543", kosten: 5400, verplicht: true,
      rapport: bodemRapportHtml(p1.naam, p1.plaats), rapportBron: "claude",
    },
  });
  await prisma.conditionerendOnderzoek.update({ where: { id: bodem.id }, data: { rapportPad: `/api/rapport/onderzoek/${bodem.id}/view` } });

  // Bureauonderzoek.
  await prisma.bureauonderzoek.create({
    data: {
      projectId: p1.id,
      bevindingenJson: bevindingen(),
      rapport: bureauRapportHtml(p1.naam, p1.plaats, 850),
      bron: "claude",
      gegenereerdOp: d("2026-02-22"),
    },
  });

  // VOCA.
  await prisma.vocaRegel.createMany({
    data: [
      { projectId: p1.id, omschrijving: "Vergunningen, leges en conditionerend onderzoek", categorie: "VERGUNNINGEN", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 41200, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Opbreken en afvoeren asfaltverharding", categorie: "GRONDWERK", eenheid: "m2", hoeveelheid: 2550, eenheidsprijs: 11.5, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Ontgraven cunet incl. verzet (sleuf 0,8 x 1,2 m)", categorie: "GRONDWERK", eenheid: "m3", hoeveelheid: 980, eenheidsprijs: 18.75, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Aanvullen en verdichten zandbed", categorie: "GRONDWERK", eenheid: "m3", hoeveelheid: 820, eenheidsprijs: 22.4, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Leveren en leggen Ø200 PE100 drinkwaterleiding", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 850, eenheidsprijs: 58.0, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Leveren en leggen 10 kV MS-kabel in mantelbuis", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 850, eenheidsprijs: 72.5, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Mantelbuizen Ø160 bij kruisingen (gestuurde boring)", categorie: "ONDERAANNEMER", eenheid: "m1", hoeveelheid: 120, eenheidsprijs: 210, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Bronbemaling sleuf incl. lozing", categorie: "MATERIEEL", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 16800, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Huisaansluitingen water (28 st)", categorie: "MATERIAAL", eenheid: "st", hoeveelheid: 28, eenheidsprijs: 465, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Herstel asfaltverharding in twee lagen", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: 2550, eenheidsprijs: 34.0, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Verkeersmaatregelen en omleidingen", categorie: "MATERIEEL", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 24500, aiGegenereerd: true },
      { projectId: p1.id, omschrijving: "Uitvoeringsbegeleiding en toezicht", categorie: "OVERIG", eenheid: "uur", hoeveelheid: 320, eenheidsprijs: 78, aiGegenereerd: false },
    ],
  });

  // MBB.
  await prisma.materiaalRegel.createMany({
    data: [
      { projectId: p1.id, artikel: "PE100 drinkwaterbuis Ø200 SDR17", eenheid: "m1", hoeveelheid: 880, leverancier: "Wavin", eenheidsprijs: 41.2, status: "GELEVERD", bron: "VOCA" },
      { projectId: p1.id, artikel: "10 kV MS-kabel 3x1x240 Al", eenheid: "m1", hoeveelheid: 880, leverancier: "TKF", eenheidsprijs: 48.9, status: "GELEVERD", bron: "VOCA" },
      { projectId: p1.id, artikel: "Mantelbuis PE Ø160 SDR11", eenheid: "m1", hoeveelheid: 140, leverancier: "Dyka", eenheidsprijs: 19.5, status: "GELEVERD", bron: "VOCA" },
      { projectId: p1.id, artikel: "Elektrolasmoffen Ø200", eenheid: "st", hoeveelheid: 24, leverancier: "Georg Fischer", eenheidsprijs: 68, status: "GELEVERD", bron: "AI" },
      { projectId: p1.id, artikel: "Huisaansluitset water compleet", eenheid: "st", hoeveelheid: 28, leverancier: "Vitens magazijn", eenheidsprijs: 92, status: "BESTELD", bron: "VOCA" },
      { projectId: p1.id, artikel: "Afzethekken + bebording (verkeersplan)", eenheid: "st", hoeveelheid: 60, leverancier: "Buko", eenheidsprijs: 6.5, status: "GELEVERD", bron: "HANDMATIG" },
      { projectId: p1.id, artikel: "Waarschuwingslint + afdekband", eenheid: "st", hoeveelheid: 40, leverancier: "Technische Unie", eenheidsprijs: 8.9, status: "TE_BESTELLEN", bron: "AI" },
      { projectId: p1.id, artikel: "Zand aanvulling (gekeurd)", eenheid: "m3", hoeveelheid: 820, leverancier: "Theo Pouw", eenheidsprijs: 14.75, status: "GELEVERD", bron: "VOCA" },
    ],
  });

  // Werktekeningen.
  await prisma.werktekening.createMany({
    data: [
      { projectId: p1.id, tekeningnummer: "HNB-2026-001-T01", titel: "Tracétekening overzicht 1:500", discipline: "TRACE", versie: "C", status: "DEFINITIEF", tekenaar: "M. de Vries", aiRationale: "Verplichte overzichtstekening met ligging MS + water." },
      { projectId: p1.id, tekeningnummer: "HNB-2026-001-D01", titel: "Dwarsprofiel gecombineerde sleuf", discipline: "DWARSPROFIEL", versie: "B", status: "GOEDGEKEURD", tekenaar: "M. de Vries" },
      { projectId: p1.id, tekeningnummer: "HNB-2026-001-X01", titel: "Detail kruising hoofdrijbaan (boring)", discipline: "DETAIL", versie: "B", status: "GOEDGEKEURD", tekenaar: "S. Bakker" },
      { projectId: p1.id, tekeningnummer: "HNB-2026-001-B01", titel: "Boorprofiel gestuurde boring kruising 3", discipline: "BOORPROFIEL", versie: "A", status: "DEFINITIEF", tekenaar: "Onderaannemer A. Hak" },
      { projectId: p1.id, tekeningnummer: "HNB-2026-001-R01", titel: "Revisietekening as-built tracé", discipline: "TRACE", versie: "A", status: "IN_REVIEW", tekenaar: "M. de Vries", aiRationale: "As-built opgemeten tijdens uitvoering." },
    ],
  });

  // Weekproducties met realisatie.
  for (const [week, oms, factor] of [
    [12, "Opbreken verharding + start grondwerk sectie 1", 1.0],
    [13, "Leggen water + MS sectie 1, start sectie 2", 0.95],
    [14, "Gestuurde boring kruising 2 en 3", 1.08],
    [15, "Huisaansluitingen + aanvulling sectie 2", 0.9],
  ]) {
    await prisma.weekproductie.create({
      data: {
        projectId: p1.id, jaar: 2026, week, omschrijving: oms, status: week < 15 ? "GOEDGEKEURD" : "INGEDIEND",
        regels: {
          create: [
            { omschrijving: "Leggen PE-drinkwaterleiding Ø200", eenheid: "m1", gepland: 210, gerealiseerd: Math.round(210 * factor), eenheidsprijs: 58 },
            { omschrijving: "Leggen MS-kabel in mantelbuis", eenheid: "m1", gepland: 210, gerealiseerd: Math.round(210 * factor), eenheidsprijs: 72.5 },
            { omschrijving: "Herstel asfaltverharding", eenheid: "m2", gepland: 630, gerealiseerd: Math.round(630 * factor * 0.8), eenheidsprijs: 34 },
          ],
        },
      },
    });
  }

  // Deelbetalingen (termijnstaat).
  await prisma.deelbetaling.createMany({
    data: [
      { projectId: p1.id, termijn: 1, datum: d("2026-04-15"), omschrijving: "Termijn 1 — grondwerk en materiaal sectie 1", bedrag: 148500, status: "BETAALD" },
      { projectId: p1.id, termijn: 2, datum: d("2026-05-15"), omschrijving: "Termijn 2 — leidingwerk en kruisingen", bedrag: 206400, status: "BETAALD" },
      { projectId: p1.id, termijn: 3, datum: d("2026-06-15"), omschrijving: "Termijn 3 — huisaansluitingen en herstel", bedrag: 132750, status: "GOEDGEKEURD" },
      { projectId: p1.id, termijn: 4, datum: d("2026-07-15"), omschrijving: "Termijn 4 — oplevering en revisie", bedrag: 64900, status: "INGEDIEND" },
    ],
  });

  // Deelrevisies.
  await prisma.deelrevisie.createMany({
    data: [
      { projectId: p1.id, deel: "Sectie 1 — Stationsplein t/m kruising 2", omschrijving: "As-built ligging water + MS, maatvoering ingemeten.", status: "GOEDGEKEURD", datum: d("2026-09-20"), aiRationale: "Revisie per sectie conform opdrachtgeverseis." },
      { projectId: p1.id, deel: "Sectie 2 — kruising 2 t/m Bergstraat", omschrijving: "As-built incl. huisaansluitingen.", status: "INGEDIEND", datum: d("2026-10-18") },
      { projectId: p1.id, deel: "Kruisingen (gestuurde boringen)", omschrijving: "Boorprofielen en werkelijke diepteligging.", status: "IN_BEWERKING" },
    ],
  });

  // Documenten (werkende links naar de rapport-view, overige als registratie).
  await prisma.document.createMany({
    data: [
      { projectId: p1.id, onderzoekId: klic.id, naam: "Onderzoeksrapport — KLIC-melding", categorie: "ONDERZOEKSRAPPORT", pad: `/api/rapport/onderzoek/${klic.id}/view` },
      { projectId: p1.id, onderzoekId: bodem.id, naam: "Onderzoeksrapport — Milieukundig bodemonderzoek", categorie: "ONDERZOEKSRAPPORT", pad: `/api/rapport/onderzoek/${bodem.id}/view` },
      { projectId: p1.id, naam: "Bureauonderzoek Stationskwartier", categorie: "BUREAUONDERZOEK" },
      { projectId: p1.id, naam: "Voorcalculatie (VOCA)", categorie: "VOORCALCULATIE" },
      { projectId: p1.id, naam: "Materiaalbestellingen (MBB)", categorie: "MBB" },
      { projectId: p1.id, naam: "Werktekeningenregister", categorie: "WERKTEKENINGEN" },
    ],
  });

  // Activiteiten (tijdlijn).
  await prisma.activiteit.createMany({
    data: [
      { projectId: p1.id, type: "STATUS", bericht: "Project aangemaakt in intakefase.", createdAt: d("2026-01-08") },
      { projectId: p1.id, type: "AI", bericht: "AI-onderzoeksadvies: 6 onderzoeken geadviseerd, 6 toegevoegd.", createdAt: d("2026-01-09") },
      { projectId: p1.id, type: "AI", bericht: "Bureauonderzoek gegenereerd (Claude): 5 thema's langs 850 m tracé.", createdAt: d("2026-02-22") },
      { projectId: p1.id, type: "STATUS", bericht: "Status gewijzigd naar Voorbereiding.", createdAt: d("2026-02-25") },
      { projectId: p1.id, type: "AI", bericht: "Voorcalculatie (Claude): 12 regels, raming € 611.000.", createdAt: d("2026-02-26") },
      { projectId: p1.id, type: "STATUS", bericht: "Status gewijzigd naar Uitvoering.", createdAt: d("2026-03-02") },
      { projectId: p1.id, type: "INFO", bericht: "Weekproductie week 12 goedgekeurd.", createdAt: d("2026-03-23") },
      { projectId: p1.id, type: "WAARSCHUWING", bericht: "Afwijkende ligging telecom bij kruising 2 — handmatig ontgraven.", createdAt: d("2026-04-02") },
      { projectId: p1.id, type: "STATUS", bericht: "Status gewijzigd naar Revisie.", createdAt: d("2026-09-15") },
    ],
  });

  // ======================================================================
  // PROJECT 2 — Leidingen water, in UITVOERING
  // ======================================================================
  const traceB = await wegTrace(
    [
      [5.6155, 52.3388],
      [5.6322, 52.3447],
    ],
    600,
    [
      [5.6195, 52.3402],
      [5.6218, 52.3408],
      [5.6243, 52.3413],
      [5.6271, 52.3417],
      [5.6298, 52.3421],
    ]
  );
  const p2 = await prisma.project.create({
    data: {
      projectnummer: "HNB-2026-002",
      naam: "Vervanging transportleiding Industrieweg",
      opdrachtgever: "Waterbedrijf Vitens",
      type: "LEIDINGEN_WATER",
      plaats: "Harderwijk",
      omschrijving: "Vervanging ca. 600 m gietijzeren transportleiding door Ø315 PE, inclusief twee kruisingen.",
      status: "UITVOERING",
      startdatum: d("2026-09-01"),
      opleverdatum: d("2026-12-15"),
      traceGeoJson: traceB,
      onderzoeken: {
        create: [
          { type: "KLIC", titel: "KLIC-melding Industrieweg", status: "ONTVANGEN", uitvoerder: "Kadaster", aanvraagdatum: d("2026-07-10"), ontvangstdatum: d("2026-07-12"), referentie: "26G0388210", verplicht: true },
          { type: "BODEM_MILIEU", titel: "Verkennend bodemonderzoek (NEN 5740)", status: "BEOORDEELD", uitvoerder: "Sigma Bouw & Milieu", ontvangstdatum: d("2026-07-28"), kosten: 4800, verplicht: true },
          { type: "GEOTECHNIEK", titel: "Sonderingen persput", status: "ONTVANGEN", uitvoerder: "Fugro", ontvangstdatum: d("2026-07-22"), kosten: 5200, verplicht: false },
          { type: "VERHARDING", titel: "Verhardingsonderzoek", status: "NOG_AAN_TE_VRAGEN", verplicht: false },
        ],
      },
    },
  });
  await prisma.bureauonderzoek.create({
    data: { projectId: p2.id, bevindingenJson: bevindingen(), rapport: bureauRapportHtml(p2.naam, p2.plaats, 600), bron: "claude", gegenereerdOp: d("2026-07-30") },
  });
  await prisma.vocaRegel.createMany({
    data: [
      { projectId: p2.id, omschrijving: "Vergunningen en onderzoek", categorie: "VERGUNNINGEN", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 22500, aiGegenereerd: true },
      { projectId: p2.id, omschrijving: "Opbreken en herstel verharding", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: 1800, eenheidsprijs: 33, aiGegenereerd: true },
      { projectId: p2.id, omschrijving: "Ontgraven en aanvullen sleuf", categorie: "GRONDWERK", eenheid: "m3", hoeveelheid: 760, eenheidsprijs: 20.5, aiGegenereerd: true },
      { projectId: p2.id, omschrijving: "Leveren/leggen Ø315 PE100 transportleiding", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 600, eenheidsprijs: 96, aiGegenereerd: true },
      { projectId: p2.id, omschrijving: "Gestuurde boring kruisingen", categorie: "ONDERAANNEMER", eenheid: "m1", hoeveelheid: 90, eenheidsprijs: 245, aiGegenereerd: true },
      { projectId: p2.id, omschrijving: "Bronbemaling", categorie: "MATERIEEL", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 14200, aiGegenereerd: true },
    ],
  });
  await prisma.materiaalRegel.createMany({
    data: [
      { projectId: p2.id, artikel: "PE100 buis Ø315 SDR17", eenheid: "m1", hoeveelheid: 620, leverancier: "Wavin", eenheidsprijs: 62.5, status: "GELEVERD", bron: "VOCA" },
      { projectId: p2.id, artikel: "Elektrolasmoffen Ø315", eenheid: "st", hoeveelheid: 18, leverancier: "Georg Fischer", eenheidsprijs: 142, status: "BESTELD", bron: "AI" },
      { projectId: p2.id, artikel: "Mantelbuis Ø400", eenheid: "m1", hoeveelheid: 100, leverancier: "Dyka", eenheidsprijs: 48, status: "TE_BESTELLEN", bron: "VOCA" },
    ],
  });
  await prisma.werktekening.createMany({
    data: [
      { projectId: p2.id, tekeningnummer: "HNB-2026-002-T01", titel: "Tracétekening Industrieweg 1:500", discipline: "TRACE", versie: "B", status: "DEFINITIEF", tekenaar: "S. Bakker" },
      { projectId: p2.id, tekeningnummer: "HNB-2026-002-D01", titel: "Dwarsprofiel sleuf Ø315", discipline: "DWARSPROFIEL", versie: "A", status: "GOEDGEKEURD", tekenaar: "S. Bakker" },
    ],
  });
  for (const [week, factor, status] of [[37, 1.0, "GOEDGEKEURD"], [38, 0.92, "GOEDGEKEURD"], [39, 1.05, "INGEDIEND"]]) {
    await prisma.weekproductie.create({
      data: {
        projectId: p2.id, jaar: 2026, week, omschrijving: `Productie week ${week}`, status,
        regels: { create: [
          { omschrijving: "Leggen Ø315 PE transportleiding", eenheid: "m1", gepland: 150, gerealiseerd: Math.round(150 * factor), eenheidsprijs: 96 },
          { omschrijving: "Herstel verharding", eenheid: "m2", gepland: 450, gerealiseerd: Math.round(450 * factor * 0.7), eenheidsprijs: 33 },
        ] },
      },
    });
  }
  await prisma.deelbetaling.createMany({
    data: [
      { projectId: p2.id, termijn: 1, datum: d("2026-10-01"), omschrijving: "Termijn 1 — mobilisatie en grondwerk", bedrag: 86500, status: "BETAALD" },
      { projectId: p2.id, termijn: 2, datum: d("2026-11-01"), omschrijving: "Termijn 2 — leidingwerk", bedrag: 112400, status: "INGEDIEND" },
    ],
  });
  await prisma.activiteit.createMany({
    data: [
      { projectId: p2.id, type: "STATUS", bericht: "Project aangemaakt in intakefase.", createdAt: d("2026-07-05") },
      { projectId: p2.id, type: "AI", bericht: "Bureauonderzoek gegenereerd (Claude).", createdAt: d("2026-07-30") },
      { projectId: p2.id, type: "STATUS", bericht: "Status gewijzigd naar Uitvoering.", createdAt: d("2026-09-01") },
      { projectId: p2.id, type: "INFO", bericht: "Weekproductie week 37 goedgekeurd.", createdAt: d("2026-09-14") },
    ],
  });

  // ======================================================================
  // PROJECT 3 — Kabels elektra, in VOORBEREIDING
  // ======================================================================
  const traceC = await wegTrace(
    [
      [6.0845, 52.5095],
      [6.1005, 52.5030],
    ],
    1400,
    [
      [6.0892, 52.5075],
      [6.0908, 52.5069],
      [6.0925, 52.5063],
      [6.0941, 52.5058],
    ]
  );
  const p3 = await prisma.project.create({
    data: {
      projectnummer: "HNB-2026-003",
      naam: "Verzwaring LS-net woonwijk De Velden",
      opdrachtgever: "Liander",
      type: "KABELS_ELEKTRA",
      plaats: "Zwolle",
      omschrijving: "Verzwaring laagspanningsnet in woonwijk: ca. 1,4 km nieuwe LS-kabel en 2 nieuwe kabelverdeelkasten.",
      status: "VOORBEREIDING",
      startdatum: d("2027-01-12"),
      opleverdatum: d("2027-05-30"),
      traceGeoJson: traceC,
      onderzoeken: {
        create: [
          { type: "KLIC", titel: "KLIC-melding De Velden", status: "ONTVANGEN", uitvoerder: "Kadaster", ontvangstdatum: d("2026-10-30"), referentie: "26G0455012", verplicht: true },
          { type: "BODEM_MILIEU", titel: "Verkennend bodemonderzoek (NEN 5740)", status: "AANGEVRAAGD", uitvoerder: "Ortageo", aanvraagdatum: d("2026-11-04"), verwachtKlaar: d("2026-12-05"), verplicht: true },
          { type: "FLORA_FAUNA", titel: "Quickscan Wet natuurbescherming", status: "IN_UITVOERING", uitvoerder: "Eelerwoude", aanvraagdatum: d("2026-11-02"), verwachtKlaar: d("2026-12-01"), verplicht: true },
          { type: "ARCHEOLOGIE", titel: "Archeologisch bureauonderzoek", status: "NOG_AAN_TE_VRAGEN", verplicht: false },
        ],
      },
    },
  });
  await prisma.bureauonderzoek.create({
    data: { projectId: p3.id, bevindingenJson: bevindingen(), rapport: bureauRapportHtml(p3.naam, p3.plaats, 1400), bron: "claude", gegenereerdOp: d("2026-11-06") },
  });
  await prisma.vocaRegel.createMany({
    data: [
      { projectId: p3.id, omschrijving: "Vergunningen en onderzoek", categorie: "VERGUNNINGEN", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 18500, aiGegenereerd: true },
      { projectId: p3.id, omschrijving: "Sleuf graven en aanvullen (trottoir/berm)", categorie: "GRONDWERK", eenheid: "m1", hoeveelheid: 1400, eenheidsprijs: 42, aiGegenereerd: true },
      { projectId: p3.id, omschrijving: "Leveren/leggen LS-kabel 4x150 Al", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 1400, eenheidsprijs: 28.5, aiGegenereerd: true },
      { projectId: p3.id, omschrijving: "Kabelverdeelkasten incl. fundatie", categorie: "MATERIAAL", eenheid: "st", hoeveelheid: 2, eenheidsprijs: 4600, aiGegenereerd: true },
      { projectId: p3.id, omschrijving: "Herstel bestrating", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: 2100, eenheidsprijs: 26, aiGegenereerd: true },
    ],
  });
  await prisma.materiaalRegel.createMany({
    data: [
      { projectId: p3.id, artikel: "LS-kabel GPLK 4x150 Al", eenheid: "m1", hoeveelheid: 1450, leverancier: "TKF", eenheidsprijs: 18.9, status: "TE_BESTELLEN", bron: "VOCA" },
      { projectId: p3.id, artikel: "Kabelverdeelkast Liander-type", eenheid: "st", hoeveelheid: 2, leverancier: "Alfen", eenheidsprijs: 3850, status: "TE_BESTELLEN", bron: "VOCA" },
    ],
  });
  await prisma.werktekening.createMany({
    data: [
      { projectId: p3.id, tekeningnummer: "HNB-2026-003-T01", titel: "Tracétekening LS-net 1:1000", discipline: "TRACE", versie: "A", status: "CONCEPT", tekenaar: "M. de Vries", aiRationale: "Eerste concept op basis van netontwerp Liander." },
      { projectId: p3.id, titel: "Dwarsprofiel kabelsleuf trottoir", discipline: "DWARSPROFIEL", versie: "A", status: "CONCEPT" },
    ],
  });
  await prisma.activiteit.createMany({
    data: [
      { projectId: p3.id, type: "STATUS", bericht: "Project aangemaakt in intakefase.", createdAt: d("2026-10-28") },
      { projectId: p3.id, type: "AI", bericht: "AI-onderzoeksadvies: 4 onderzoeken geadviseerd.", createdAt: d("2026-10-29") },
      { projectId: p3.id, type: "AI", bericht: "Bureauonderzoek gegenereerd (Claude).", createdAt: d("2026-11-06") },
      { projectId: p3.id, type: "STATUS", bericht: "Status gewijzigd naar Voorbereiding.", createdAt: d("2026-11-08") },
    ],
  });

  const projecten = await prisma.project.count();
  const onderzoeken = await prisma.conditionerendOnderzoek.count();
  console.log(`Seed klaar: ${projecten} projecten, ${onderzoeken} onderzoeken, met VOCA/MBB/tekeningen/weekproducties/termijnen/revisies/rapporten.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

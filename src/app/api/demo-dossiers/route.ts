import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
// 60s = maximum op Vercel Hobby (300 werkt alleen op Pro).
export const maxDuration = 60;

// Maakt 3 combi-projecten (water + elektra, ~500 m), doorloopt ze volledig en
// genereert alle dossierdocumenten. Bedoeld om één keer aan te roepen.
// Met ?regen=1 worden het bureauonderzoek (verse open data) én de documenten
// van bestaande projecten herbouwd.
export async function GET(req: NextRequest) {
  // Zware libs (pdfkit/docx/archiver/exceljs via de dossier-keten) pas bij een
  // request laden, niet tijdens de build-fase "collect page data".
  const { vulEnVoltooiProject, schrijfDossier } = await import("@/lib/dossier");
  const { haalBevindingen, traceCoords, traceLengteMeter } = await import("@/lib/opendata");
  const { bureauonderzoekRapport } = await import("@/lib/ai");
  const { volgDeWeg, naarTraceGeoJson } = await import("@/lib/routing");
  const { schrijfOnderzoekRapport } = await import("@/lib/onderzoekrapport");

  if (req.nextUrl.searchParams.get("rapporten") === "1") {
    const onderzoeken = await prisma.conditionerendOnderzoek.findMany({ select: { id: true } });
    let n = 0;
    for (const o of onderzoeken) {
      if (await schrijfOnderzoekRapport(o.id)) n++;
    }
    return NextResponse.json({ ok: true, rapporten: n });
  }
  if (req.nextUrl.searchParams.get("regen") === "1") {
    const resnap = req.nextUrl.searchParams.get("resnap") === "1";
    const projecten = await prisma.project.findMany();
    const uit: unknown[] = [];
    for (const p of projecten) {
      // Tracé op de weg leggen (berm) via routering, indien gevraagd
      if (resnap && p.traceGeoJson) {
        const c = traceCoords(p.traceGeoJson);
        if (c.length >= 2) {
          const weg = await volgDeWeg([c[0], c[c.length - 1]]);
          if (weg && weg.length >= 2) {
            p.traceGeoJson = naarTraceGeoJson(weg);
            await prisma.project.update({ where: { id: p.id }, data: { traceGeoJson: p.traceGeoJson } });
          }
        }
      }
      // Bureauonderzoek opnieuw uitvoeren (live open data) wanneer er een tracé is
      if (p.traceGeoJson) {
        const coords = traceCoords(p.traceGeoJson);
        const lengte = traceLengteMeter(coords);
        const bevindingen = await haalBevindingen(p.traceGeoJson);
        const rap = await bureauonderzoekRapport(
          { naam: p.naam, type: p.type, plaats: p.plaats, omschrijving: p.omschrijving, opdrachtgever: p.opdrachtgever },
          bevindingen,
          lengte
        );
        await prisma.bureauonderzoek.upsert({
          where: { projectId: p.id },
          create: { projectId: p.id, bevindingenJson: JSON.stringify(bevindingen), rapport: rap.rapport, bron: rap.bron, gegenereerdOp: new Date() },
          update: { bevindingenJson: JSON.stringify(bevindingen), rapport: rap.rapport, bron: rap.bron, gegenereerdOp: new Date() },
        });
      }
      const n = await schrijfDossier(p.id);
      uit.push({ projectnummer: p.projectnummer, documenten: n });
    }
    return NextResponse.json({ ok: true, geregenereerd: uit.length, projecten: uit });
  }
  // Realistische, bochtige tracés langs straten (ca. 500 m).
  const defs = [
    {
      naam: "Combi water & elektra Nijkerkerstraat",
      plaats: "Nijkerk",
      coords: [
        [5.484, 52.2206], [5.4853, 52.2209], [5.4866, 52.2211],
        [5.4879, 52.221], [5.4889, 52.2206], [5.4894, 52.2199],
      ],
    },
    {
      naam: "Combi water & elektra De Hoef-West",
      plaats: "Amersfoort",
      coords: [
        [5.376, 52.1548], [5.3773, 52.1552], [5.3786, 52.1556],
        [5.38, 52.1558], [5.3813, 52.1556], [5.3821, 52.155],
      ],
    },
    {
      naam: "Combi water & elektra Leidsche Rijn",
      plaats: "Utrecht",
      coords: [
        [5.0384, 52.0912], [5.0398, 52.0916], [5.0412, 52.0919],
        [5.0426, 52.0919], [5.0438, 52.0915], [5.0446, 52.0909],
      ],
    },
  ];
  const jaar = new Date().getFullYear();
  const resultaten: unknown[] = [];

  for (const d of defs) {
    const aantal = await prisma.project.count();
    const projectnummer = `HNB-${jaar}-${String(aantal + 1).padStart(3, "0")}`;
    const trace = JSON.stringify({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: d.coords },
    });
    const project = await prisma.project.create({
      data: {
        projectnummer,
        naam: d.naam,
        opdrachtgever: "Vitens & Liander",
        type: "COMBI",
        plaats: d.plaats,
        omschrijving:
          "Gecombineerde aanleg waterleiding (PE) en MS-kabel over ca. 500 m in bestaande rijbaan, incl. gestuurde boring onder watergang.",
        status: "INTAKE",
        startdatum: new Date("2026-03-02"),
        opleverdatum: new Date("2026-04-10"),
        traceGeoJson: trace,
        activiteiten: { create: { type: "STATUS", bericht: "Project aangemaakt (demo-dossier)." } },
      },
    });
    const aantalDocs = await vulEnVoltooiProject(project.id);
    resultaten.push({ id: project.id, projectnummer, naam: d.naam, documenten: aantalDocs });
  }

  return NextResponse.json({ ok: true, aangemaakt: resultaten.length, projecten: resultaten });
}

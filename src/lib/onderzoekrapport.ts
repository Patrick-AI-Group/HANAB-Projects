// Genereert en bewaart een AI-rapport voor één conditionerend onderzoek,
// inclusief de HANAB-huisstijl HTML en de documentregistratie. Server-only.

import { promises as fs } from "fs";
import path from "path";
import { prisma } from "./db";
import { onderzoekRapport } from "./ai";
import { onderzoekRapportHtml } from "./documenten";
import { traceCoords, traceLengteMeter } from "./opendata";
import { labelOnderzoek } from "./domein";

export async function schrijfOnderzoekRapport(onderzoekId: string): Promise<string | null> {
  const onderzoek = await prisma.conditionerendOnderzoek.findUnique({ where: { id: onderzoekId } });
  if (!onderzoek) return null;
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: onderzoek.projectId },
    include: { bureauonderzoek: true },
  });

  let bevindingen: any[] = [];
  try {
    bevindingen = project.bureauonderzoek?.bevindingenJson ? JSON.parse(project.bureauonderzoek.bevindingenJson) : [];
  } catch {
    bevindingen = [];
  }
  const coords = traceCoords(project.traceGeoJson);
  const lengte = coords.length >= 2 ? traceLengteMeter(coords) : undefined;

  const ctx = {
    naam: project.naam,
    type: project.type,
    plaats: project.plaats,
    omschrijving: project.omschrijving,
    opdrachtgever: project.opdrachtgever,
  };
  const resultaat = await onderzoekRapport(ctx, onderzoek, bevindingen, lengte);

  const datum = new Date().toLocaleDateString("nl-NL");
  const html = onderzoekRapportHtml(project, onderzoek, resultaat.tekst, datum);
  const dir = path.join(process.cwd(), "public", "docs", project.projectnummer, "onderzoeken");
  await fs.mkdir(dir, { recursive: true });
  const bestand = `${onderzoek.type.toLowerCase()}-${onderzoek.id.slice(-5)}.html`;
  await fs.writeFile(path.join(dir, bestand), html, "utf8");
  const pad = `/docs/${encodeURIComponent(project.projectnummer)}/onderzoeken/${bestand}`;

  await prisma.conditionerendOnderzoek.update({
    where: { id: onderzoekId },
    data: { rapport: resultaat.tekst, rapportBron: resultaat.bron, rapportPad: pad },
  });
  // Dubbele registratie voorkomen: verwijder een eerdere registratie voor dit onderzoek.
  await prisma.document.deleteMany({ where: { onderzoekId, categorie: "ONDERZOEKSRAPPORT" } });
  await prisma.document.create({
    data: {
      projectId: project.id,
      onderzoekId,
      naam: `Onderzoeksrapport — ${labelOnderzoek(onderzoek.type)}`,
      categorie: "ONDERZOEKSRAPPORT",
      pad,
    },
  });
  await prisma.activiteit.create({
    data: {
      projectId: project.id,
      type: "AI",
      bericht: `Onderzoeksrapport gegenereerd (${resultaat.bron === "claude" ? "Claude" : "lokale regels"}): ${labelOnderzoek(onderzoek.type)}.`,
    },
  });
  return project.id;
}

// Server-only. Vult een project volledig (alle modules), rondt het af, voert
// het bureauonderzoek uit (live open data) en schrijft + registreert alle
// dossierdocumenten.

import { promises as fs, createWriteStream } from "fs";
import path from "path";
import archiver from "archiver";
import { prisma } from "./db";
import {
  onderzoeksadvies,
  voorcalculatieAdvies,
  materiaalAdvies,
  werktekeningAdvies,
  deelrevisieAdvies,
  bureauonderzoekRapport,
  type ProjectContext,
} from "./ai";
import { haalBevindingen, traceCoords, traceLengteMeter } from "./opendata";
import { bouwDossier } from "./documenten";
import { dossierPdf } from "./export-pdf";
import { dossierDocx } from "./export-docx";
import { tekeningVoor } from "./tekeningen";
import { maakKaartje } from "./kaart";

const UITVOERDERS: Record<string, string> = {
  KLIC: "Kadaster",
  BODEM_MILIEU: "Ortageo",
  BODEM_VERKENNEND: "Ortageo",
  ARCHEOLOGIE: "RAAP",
  NGE: "Saricon",
  FLORA_FAUNA: "Bureau Waardenburg",
  GEOTECHNIEK: "Fugro",
  VERHARDING: "Kiwa KOAC",
  WATER_BEMALING: "Henk van Tongeren Water",
  OVERIG: "—",
};

function ctxVan(p: any): ProjectContext {
  return {
    naam: p.naam,
    type: p.type,
    plaats: p.plaats,
    omschrijving: p.omschrijving,
    opdrachtgever: p.opdrachtgever,
  };
}

async function wisModules(projectId: string) {
  await prisma.conditionerendOnderzoek.deleteMany({ where: { projectId } });
  await prisma.vocaRegel.deleteMany({ where: { projectId } });
  await prisma.materiaalRegel.deleteMany({ where: { projectId } });
  await prisma.werktekening.deleteMany({ where: { projectId } });
  await prisma.weekproductie.deleteMany({ where: { projectId } });
  await prisma.deelbetaling.deleteMany({ where: { projectId } });
  await prisma.deelrevisie.deleteMany({ where: { projectId } });
}

/** Vult alle modules, voert het bureauonderzoek uit en rondt het project af. */
export async function vulEnVoltooiProject(projectId: string) {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const ctx = ctxVan(p);
  await wisModules(projectId);

  // 1. Conditionerende onderzoeken — alle beoordeeld
  const adv = await onderzoeksadvies(ctx);
  for (const a of adv.adviezen) {
    await prisma.conditionerendOnderzoek.create({
      data: {
        projectId,
        type: a.type,
        titel: a.titel,
        verplicht: a.verplicht,
        status: "BEOORDEELD",
        uitvoerder: UITVOERDERS[a.type] ?? null,
        aanvraagdatum: new Date("2026-01-12"),
        ontvangstdatum: new Date("2026-02-09"),
        aiRationale: a.rationale,
      },
    });
  }

  // 2. Voorcalculatie
  const voca = await voorcalculatieAdvies(ctx);
  const vocaRegels: Array<{
    omschrijving: string;
    categorie: string;
    eenheid: string;
    hoeveelheid: number;
    eenheidsprijs: number;
  }> = [];
  for (const r of voca.regels) {
    const rij = await prisma.vocaRegel.create({
      data: {
        projectId,
        omschrijving: r.omschrijving,
        categorie: r.categorie,
        eenheid: r.eenheid,
        hoeveelheid: r.hoeveelheid,
        eenheidsprijs: r.eenheidsprijs,
        aiGegenereerd: true,
      },
    });
    vocaRegels.push(rij);
  }

  // 3. MBB — geleverd
  const mbb = await materiaalAdvies(
    ctx,
    vocaRegels.map((v) => ({
      omschrijving: v.omschrijving,
      categorie: v.categorie,
      eenheid: v.eenheid,
      hoeveelheid: v.hoeveelheid,
      eenheidsprijs: v.eenheidsprijs,
    }))
  );
  for (const m of mbb.regels) {
    await prisma.materiaalRegel.create({
      data: {
        projectId,
        artikel: m.artikel,
        eenheid: m.eenheid,
        hoeveelheid: m.hoeveelheid,
        leverancier: m.leverancier ?? null,
        eenheidsprijs: m.eenheidsprijs ?? null,
        status: "GELEVERD",
        bron: mbb.bron === "claude" ? "AI" : "VOCA",
      },
    });
  }

  // 4. Werktekeningen — definitief
  const tk = await werktekeningAdvies(ctx);
  let nr = 1;
  for (const t of tk.tekeningen) {
    await prisma.werktekening.create({
      data: {
        projectId,
        tekeningnummer: `${p.projectnummer}-${String(nr++).padStart(2, "0")}`,
        titel: t.titel,
        discipline: t.discipline,
        versie: "C",
        status: "DEFINITIEF",
        tekenaar: "Werkvoorbereiding HANAB",
        aiRationale: t.rationale,
      },
    });
  }

  // 5. Bureauonderzoek — live open data langs tracé
  if (p.traceGeoJson) {
    const coords = traceCoords(p.traceGeoJson);
    const lengte = traceLengteMeter(coords);
    const bevindingen = await haalBevindingen(p.traceGeoJson);
    const rap = await bureauonderzoekRapport(ctx, bevindingen, lengte);
    await prisma.bureauonderzoek.upsert({
      where: { projectId },
      create: {
        projectId,
        bevindingenJson: JSON.stringify(bevindingen),
        rapport: rap.rapport,
        bron: rap.bron,
        gegenereerdOp: new Date(),
      },
      update: {
        bevindingenJson: JSON.stringify(bevindingen),
        rapport: rap.rapport,
        bron: rap.bron,
        gegenereerdOp: new Date(),
      },
    });
  }

  // 6. Weekproducties — 4 weken, volledig gerealiseerd
  const werkposten = vocaRegels.filter((v) => v.categorie !== "VERGUNNINGEN");
  const WEKEN = 4;
  let gerealiseerdTotaal = 0;
  for (let i = 0; i < WEKEN; i++) {
    const regels = werkposten.map((v) => {
      const deel = Math.round((v.hoeveelheid / WEKEN) * 100) / 100;
      gerealiseerdTotaal += deel * v.eenheidsprijs;
      return {
        omschrijving: v.omschrijving,
        eenheid: v.eenheid,
        gepland: deel,
        gerealiseerd: deel,
        eenheidsprijs: v.eenheidsprijs,
      };
    });
    await prisma.weekproductie.create({
      data: {
        projectId,
        jaar: 2026,
        week: 10 + i,
        status: "GOEDGEKEURD",
        regels: { create: regels },
      },
    });
  }

  // 7. Deelbetalingen — twee termijnen die samen de gerealiseerde productie dekken
  const t1 = Math.round((gerealiseerdTotaal / 2) * 100) / 100;
  const t2 = Math.round((gerealiseerdTotaal - t1) * 100) / 100;
  await prisma.deelbetaling.create({
    data: { projectId, termijn: 1, datum: new Date("2026-03-16"), omschrijving: "Termijn 1 — t/m week 11", bedrag: t1, status: "BETAALD" },
  });
  await prisma.deelbetaling.create({
    data: { projectId, termijn: 2, datum: new Date("2026-03-30"), omschrijving: "Termijn 2 — t/m week 13 (eindafrekening)", bedrag: t2, status: "GOEDGEKEURD" },
  });

  // 8. Deelrevisies — goedgekeurd
  const rev = await deelrevisieAdvies(ctx);
  for (const r of rev.revisies) {
    await prisma.deelrevisie.create({
      data: { projectId, deel: r.deel, omschrijving: r.omschrijving, status: "GOEDGEKEURD", datum: new Date("2026-04-06"), aiRationale: r.rationale },
    });
  }

  // 9. Project afronden
  await prisma.project.update({ where: { id: projectId }, data: { status: "AFGEROND" } });
  await prisma.activiteit.create({
    data: { projectId, type: "STATUS", bericht: "Project volledig doorlopen en afgerond; dossier gegenereerd." },
  });

  // 10. Documenten wegschrijven
  return await schrijfDossier(projectId);
}

/** Genereert en bewaart alle dossierdocumenten op basis van de huidige data. */
export async function schrijfDossier(projectId: string): Promise<number> {
  const p = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      onderzoeken: { orderBy: { createdAt: "asc" } },
      vocaRegels: { orderBy: { createdAt: "asc" } },
      materiaalRegels: { orderBy: { createdAt: "asc" } },
      werktekeningen: { orderBy: { createdAt: "asc" } },
      weekproducties: { orderBy: [{ jaar: "asc" }, { week: "asc" }], include: { regels: true } },
      deelbetalingen: { orderBy: { termijn: "asc" } },
      deelrevisies: { orderBy: { createdAt: "asc" } },
      bureauonderzoek: true,
    },
  });

  const datum = new Date().toLocaleDateString("nl-NL");
  const dir = path.join(process.cwd(), "public", "docs", p.projectnummer);
  await fs.mkdir(dir, { recursive: true });
  const urlDir = `/docs/${encodeURIComponent(p.projectnummer)}`;

  // Situatiekaart (OSM-tegels + tracé)
  const coords = traceCoords(p.traceGeoJson);
  const kaartje = coords.length >= 2 ? await maakKaartje(coords).catch(() => null) : null;

  // Werktekeningen (SVG) genereren, koppelen én verzamelen voor inbedding
  let cptAantal = 0;
  try {
    const bev = p.bureauonderzoek?.bevindingenJson ? JSON.parse(p.bureauonderzoek.bevindingenJson) : [];
    cptAantal = bev.find((b: any) => b.thema === "Geotechniek")?.aantal ?? 0;
  } catch {
    cptAantal = 0;
  }
  const tekBestanden: { naam: string; bestand: string }[] = [];
  const tekeningSvgs: { titel: string; svg: string }[] = [];
  if (p.werktekeningen.length > 0) {
    await fs.mkdir(path.join(dir, "tekeningen"), { recursive: true });
    for (const t of p.werktekeningen) {
      const svg = tekeningVoor(p, coords, t, datum, cptAantal);
      const bestand = `tekeningen/${t.discipline.toLowerCase()}-${t.id.slice(-5)}.svg`;
      await fs.writeFile(path.join(dir, bestand), svg, "utf8");
      await prisma.werktekening.update({ where: { id: t.id }, data: { pad: `${urlDir}/${bestand}` } });
      tekBestanden.push({ naam: `Werktekening — ${t.titel}`, bestand });
      tekeningSvgs.push({ titel: t.titel, svg });
    }
  }

  // Dossierstukken (met situatiekaart + tekeningen ingebed)
  const lengteM = coords.length >= 2 ? traceLengteMeter(coords) : undefined;
  const stukken = bouwDossier(p, datum, { kaartjeSvg: kaartje?.svg, tekeningen: tekeningSvgs, lengteM });

  // 1. Losse stukken (HTML + CSV) wegschrijven
  const bestanden: string[] = [];
  for (const s of stukken) {
    await fs.writeFile(path.join(dir, s.bestandsnaam), s.inhoud, "utf8");
    bestanden.push(s.bestandsnaam);
  }

  // 2. Geconsolideerd dossier als echte PDF en Word
  const [pdf, docx] = await Promise.all([
    dossierPdf(p, datum, { kaartje, tekeningen: tekeningSvgs }),
    dossierDocx(p, datum),
  ]);
  await fs.writeFile(path.join(dir, "Projectdossier.pdf"), pdf);
  await fs.writeFile(path.join(dir, "Projectdossier.docx"), docx);

  // 3. Alles bundelen in één ZIP
  await maakZip(path.join(dir, "Projectdossier.zip"), dir, [
    "Projectdossier.pdf",
    "Projectdossier.docx",
    ...bestanden,
    ...tekBestanden.map((x) => x.bestand),
  ]);

  // 4. Registraties verversen
  await prisma.document.deleteMany({ where: { projectId } });
  await prisma.document.create({
    data: { projectId, naam: "Projectdossier — ZIP (volledig)", categorie: "DOSSIER", pad: `${urlDir}/Projectdossier.zip` },
  });
  await prisma.document.create({
    data: { projectId, naam: "Projectdossier (PDF)", categorie: "DOSSIER", pad: `${urlDir}/Projectdossier.pdf` },
  });
  await prisma.document.create({
    data: { projectId, naam: "Projectdossier (Word)", categorie: "DOSSIER", pad: `${urlDir}/Projectdossier.docx` },
  });
  for (const s of stukken) {
    await prisma.document.create({
      data: { projectId, naam: s.naam, categorie: s.categorie, pad: `${urlDir}/${s.bestandsnaam}` },
    });
  }
  for (const tk of tekBestanden) {
    await prisma.document.create({
      data: { projectId, naam: tk.naam, categorie: "WERKTEKENINGEN", pad: `${urlDir}/${tk.bestand}` },
    });
  }
  return stukken.length + 3 + tekBestanden.length;
}

/** Bundelt de opgegeven bestanden uit `dir` in één ZIP op `outPath`. */
function maakZip(outPath: string, dir: string, files: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    archive.on("error", (e) => reject(e));
    archive.pipe(output);
    for (const f of files) archive.file(path.join(dir, f), { name: f });
    archive.finalize();
  });
}

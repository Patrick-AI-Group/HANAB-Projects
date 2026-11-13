// Haalt 2 nieuwe demo-projecten door de ECHTE AI-flow (dezelfde ai.ts-functies
// als de serveracties: onderzoeksadvies → voorcalculatie → materiaal → revisie).
// Draait met de API-sleutel uit .env en kost echte tokens.
//
//   npx tsx prisma/seed-ai.mts
//
import { readFileSync } from "fs";

// Sleutel uit .env in de omgeving zetten (tsx laadt .env niet automatisch).
const envLine = readFileSync(".env", "utf8")
  .split("\n")
  .find((l) => !l.trim().startsWith("#") && l.includes("ANTHROPIC_API_KEY="));
if (envLine) {
  process.env.ANTHROPIC_API_KEY = envLine.split("=").slice(1).join("=").replace(/^"|"$/g, "").trim();
}

const { prisma } = await import("../src/lib/db");
const { onderzoeksadvies, voorcalculatieAdvies, materiaalAdvies, deelrevisieAdvies } = await import("../src/lib/ai");

type Def = {
  nr: string;
  naam: string;
  og: string;
  type: string;
  plaats: string;
  status: string;
  omschrijving: string;
  start: string;
  opl: string;
  uitvoering: boolean;
};

const DEFS: Def[] = [
  {
    nr: "HNB-2026-013",
    naam: "Verkabeling 150 kV hoogspanning buitengebied (demo-ai)",
    og: "TenneT & Liander",
    type: "KABELS_ELEKTRA",
    plaats: "Zutphen",
    status: "VOORBEREIDING",
    omschrijving:
      "Ondergronds brengen van een bovengrondse 150 kV-hoogspanningsverbinding over ca. 2,4 km door agrarisch buitengebied, inclusief twee open-front boringen onder watergangen en een kruising met een provinciale weg. Tracé raakt een archeologisch verwachtingsgebied en een weidevogelkerngebied.",
    start: "2026-09-15",
    opl: "2027-06-30",
    uitvoering: false,
  },
  {
    nr: "HNB-2026-014",
    naam: "Vervanging gietijzeren drinkwaternet historisch centrum (demo-ai)",
    og: "Vitens",
    type: "LEIDINGEN_WATER",
    plaats: "Deventer",
    status: "UITVOERING",
    omschrijving:
      "Vervanging van ca. 1,1 km verouderd gietijzeren drinkwaterdistributienet in de historische binnenstad door PE100, inclusief 180 huisaansluitingen, werken in smalle middeleeuwse straten met beperkte werkruimte en mogelijke archeologische resten in de ondergrond.",
    start: "2026-03-10",
    opl: "2026-11-28",
    uitvoering: true,
  },
];

const d = (s: string) => new Date(s);

async function run(def: Def) {
  const bestaat = await prisma.project.findUnique({ where: { projectnummer: def.nr } });
  if (bestaat) {
    console.log(`  ${def.nr} bestaat al — overslaan.`);
    return;
  }

  const project = await prisma.project.create({
    data: {
      projectnummer: def.nr,
      naam: def.naam,
      opdrachtgever: def.og,
      type: def.type,
      plaats: def.plaats,
      omschrijving: def.omschrijving,
      status: def.status,
      startdatum: d(def.start),
      opleverdatum: d(def.opl),
    },
  });
  console.log(`\n● ${def.nr} — ${def.plaats} (${def.status})`);

  const ctx = {
    naam: project.naam,
    type: project.type,
    plaats: project.plaats,
    omschrijving: project.omschrijving,
    opdrachtgever: project.opdrachtgever,
    bestaandeOnderzoeken: [] as { type: string; status: string; verwachtKlaar?: Date | null; titel?: string | null }[],
  };

  // 1. AI-onderzoeksadvies → onderzoeken
  const oa = await onderzoeksadvies(ctx);
  for (const a of oa.adviezen) {
    await prisma.conditionerendOnderzoek.create({
      data: {
        projectId: project.id,
        type: a.type,
        titel: a.titel,
        verplicht: a.verplicht,
        status: "NOG_AAN_TE_VRAGEN",
        aiRationale: `${a.rationale} (indicatieve doorlooptijd ~${a.doorlooptijdWeken} wkn)`,
      },
    });
  }
  console.log(`  onderzoeksadvies [${oa.bron}]: ${oa.adviezen.length} onderzoeken`);
  ctx.bestaandeOnderzoeken = oa.adviezen.map((a) => ({ type: a.type, status: "NOG_AAN_TE_VRAGEN", titel: a.titel }));

  // 2. AI-voorcalculatie → VOCA
  const va = await voorcalculatieAdvies(ctx);
  await prisma.vocaRegel.createMany({
    data: va.regels.map((r) => ({
      projectId: project.id,
      omschrijving: r.omschrijving,
      categorie: r.categorie,
      eenheid: r.eenheid,
      hoeveelheid: r.hoeveelheid,
      eenheidsprijs: r.eenheidsprijs,
      aiGegenereerd: true,
    })),
  });
  const vocaTotaal = va.regels.reduce((s, r) => s + r.hoeveelheid * r.eenheidsprijs, 0);
  console.log(`  voorcalculatie [${va.bron}]: ${va.regels.length} regels, raming € ${Math.round(vocaTotaal).toLocaleString("nl-NL")}`);

  // 3. AI-materiaal (MBB) uit VOCA
  const voca = await prisma.vocaRegel.findMany({ where: { projectId: project.id } });
  const ma = await materiaalAdvies(
    ctx,
    voca.map((v) => ({ omschrijving: v.omschrijving, categorie: v.categorie, eenheid: v.eenheid, hoeveelheid: v.hoeveelheid, eenheidsprijs: v.eenheidsprijs })),
  );
  const uitVoca = voca.some((v) => v.categorie === "MATERIAAL");
  await prisma.materiaalRegel.createMany({
    data: ma.regels.map((r) => ({
      projectId: project.id,
      artikel: r.artikel,
      eenheid: r.eenheid,
      hoeveelheid: r.hoeveelheid,
      leverancier: r.leverancier ?? null,
      eenheidsprijs: r.eenheidsprijs ?? null,
      status: "TE_BESTELLEN",
      bron: uitVoca ? "VOCA" : "AI",
    })),
  });
  console.log(`  materiaal [${uitVoca ? "uit VOCA" : ma.bron}]: ${ma.regels.length} artikelen`);

  // 4. Alleen UITVOERING: weekproductie + termijn (deels) + AI-revisieadvies
  if (def.uitvoering) {
    const posten = va.regels.filter((r) => r.categorie !== "VERGUNNINGEN");
    await prisma.weekproductie.create({
      data: {
        projectId: project.id,
        jaar: 2026,
        week: 12,
        omschrijving: "Productie week 12",
        status: "INGEDIEND",
        regels: {
          create: posten.map((r) => ({
            omschrijving: r.omschrijving,
            eenheid: r.eenheid,
            gepland: Math.round(r.hoeveelheid * 0.5 * 10) / 10,
            gerealiseerd: Math.round(r.hoeveelheid * 0.3 * 10) / 10,
            eenheidsprijs: r.eenheidsprijs,
          })),
        },
      },
    });
    const gerealiseerd = posten.reduce((s, r) => s + Math.round(r.hoeveelheid * 0.3 * 10) / 10 * r.eenheidsprijs, 0);
    // Eén ingediende termijn van 55% → laat OHW staan.
    await prisma.deelbetaling.create({
      data: {
        projectId: project.id,
        termijn: 1,
        datum: d("2026-04-02"),
        omschrijving: "Termijn 1 — gerealiseerde productie t/m week 12",
        bedrag: Math.round(gerealiseerd * 0.55 * 100) / 100,
        status: "INGEDIEND",
      },
    });

    const ra = await deelrevisieAdvies(ctx);
    for (const r of ra.revisies) {
      await prisma.deelrevisie.create({
        data: { projectId: project.id, deel: r.deel, omschrijving: r.omschrijving || null, aiRationale: r.rationale || null, status: "OPENSTAAND" },
      });
    }
    console.log(`  revisieadvies [${ra.bron}]: ${ra.revisies.length} delen`);
  }

  await prisma.activiteit.create({
    data: { projectId: project.id, type: "AI", bericht: "Project aangemaakt en door de AI-flow gehaald (onderzoek, voorcalculatie, materiaal).", },
  });
}

for (const def of DEFS) await run(def);
const totaal = await prisma.project.count();
console.log(`\nKlaar. Totaal projecten: ${totaal}`);
await prisma.$disconnect();

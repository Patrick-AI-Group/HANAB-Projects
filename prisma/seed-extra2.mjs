// Taak 1: maakt de termijnen van HNB-2026-001/002 consistent met de
//          gerealiseerde productie, zodat Onderhanden Werk (OHW) op het
//          dashboard zichtbaar wordt.
// Taak 3: voegt 3 scriptprojecten toe in verschillende fasen die bewust
//          "AI-klaar" zijn (ontbrekende VOCA / deelrevisies), zodat je tijdens
//          de demo zelf nog AI-agents kunt laten draaien.
//
//   node prisma/seed-extra2.mjs
//
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const d = (s) => new Date(s);

// --- Taak 1: termijnen 001/002 consistent maken ------------------------------

async function herstelTermijnen(projectnummer) {
  const p = await prisma.project.findUnique({
    where: { projectnummer },
    include: { weekproducties: { include: { regels: true } }, deelbetalingen: true },
  });
  if (!p) return null;

  const G = p.weekproducties.flatMap((w) => w.regels).reduce((s, r) => s + r.gerealiseerd * r.eenheidsprijs, 0);
  if (G <= 0) return null;

  // Alle bestaande termijnen vervangen door een consistente opbouw:
  //   45% betaald + 25% ingediend/goedgekeurd + 10% concept = 80% opgenomen
  //   → 20% blijft staan als Onderhanden Werk.
  await prisma.deelbetaling.deleteMany({ where: { projectId: p.id } });
  const r2 = (x) => Math.round(x * 100) / 100;
  const ingediendStatus = p.status === "REVISIE" ? "GOEDGEKEURD" : "INGEDIEND";
  await prisma.deelbetaling.createMany({
    data: [
      { projectId: p.id, termijn: 1, datum: d("2026-05-15"), omschrijving: "Termijn 1 — tussentijdse opname", bedrag: r2(G * 0.45), status: "BETAALD" },
      { projectId: p.id, termijn: 2, datum: d("2026-07-20"), omschrijving: "Termijn 2 — gerealiseerde productie", bedrag: r2(G * 0.25), status: ingediendStatus },
      { projectId: p.id, termijn: 3, datum: null, omschrijving: "Termijn 3 — concept", bedrag: r2(G * 0.1), status: "CONCEPT" },
    ],
  });
  return { projectnummer, G: Math.round(G), ohw: Math.round(G * 0.2) };
}

// --- Taak 3: generatoren (compact) -------------------------------------------

function voca(type) {
  const m = {
    KABELS_ELEKTRA: [
      { omschrijving: "Graven kabelsleuf 0,8 m", categorie: "GRONDWERK", eenheid: "m1", hoeveelheid: 600, eenheidsprijs: 28 },
      { omschrijving: "Leggen LS-kabel 4x150 Al", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 600, eenheidsprijs: 41 },
      { omschrijving: "Herstel open bestrating", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: 380, eenheidsprijs: 36 },
    ],
    LEIDINGEN_WATER: [
      { omschrijving: "Graven leidingsleuf 1,2 m", categorie: "GRONDWERK", eenheid: "m1", hoeveelheid: 680, eenheidsprijs: 33 },
      { omschrijving: "Leggen PE-leiding Ø200", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 680, eenheidsprijs: 52 },
      { omschrijving: "Herstel asfaltverharding", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: 300, eenheidsprijs: 34 },
    ],
    COMBI: [
      { omschrijving: "Graven gecombineerde sleuf", categorie: "GRONDWERK", eenheid: "m1", hoeveelheid: 560, eenheidsprijs: 39 },
      { omschrijving: "Leggen MS-kabel 10 kV", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 560, eenheidsprijs: 72.5 },
      { omschrijving: "Herstel asfaltverharding", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: 340, eenheidsprijs: 34 },
    ],
  };
  return m[type] ?? m.COMBI;
}

const ONDERZOEK = {
  intake: [
    { type: "KLIC", status: "NOG_AAN_TE_VRAGEN", uitvoerder: "Kadaster", verplicht: true },
    { type: "BODEM_VERKENNEND", status: "NOG_AAN_TE_VRAGEN", uitvoerder: "Tauw", verplicht: true },
  ],
  voorbereiding: [
    { type: "KLIC", status: "ONTVANGEN", uitvoerder: "Kadaster", verplicht: true, kosten: 180 },
    { type: "FLORA_FAUNA", status: "AANGEVRAAGD", uitvoerder: "Eelerwoude", verplicht: true },
    { type: "GEOTECHNIEK", status: "AANGEVRAAGD", uitvoerder: "Wiertsema & Partners", verplicht: false },
  ],
  uitvoering: [
    { type: "KLIC", status: "BEOORDEELD", uitvoerder: "Kadaster", verplicht: true, kosten: 180 },
    { type: "FLORA_FAUNA", status: "BEOORDEELD", uitvoerder: "Eelerwoude", verplicht: true, kosten: 4100 },
  ],
};

// Scriptprojecten in verschillende fasen, bewust AI-klaar.
const DEFS = [
  {
    nr: "HNB-2026-015", naam: "Netuitbreiding bedrijvenpark Poort (demo)", og: "Liander", type: "KABELS_ELEKTRA",
    plaats: "Almere", status: "INTAKE", cat: "intake",
    omschrijving: "Nieuwe MS/LS-infrastructuur voor een bedrijvenpark in ontwikkeling. Scope nog niet gecalculeerd — klaar voor AI-voorcalculatie.",
    aiKlaar: "AI-onderzoeksadvies / AI-voorcalculatie",
  },
  {
    nr: "HNB-2026-016", naam: "Aanleg warmtenet tracé Waalfront (demo)", og: "Alliander & Nijmegen", type: "COMBI",
    plaats: "Nijmegen", status: "VOORBEREIDING", cat: "voorbereiding", start: "2026-10-01", opl: "2027-07-15",
    omschrijving: "Gecombineerd tracé voor warmtenet en elektra langs het Waalfront. Onderzoeken lopen, nog geen voorcalculatie — klaar voor AI-voorcalculatie.",
    aiKlaar: "AI-voorcalculatie",
  },
  {
    nr: "HNB-2026-017", naam: "Renovatie waterleiding dorpskern (demo)", og: "Vitens", type: "LEIDINGEN_WATER",
    plaats: "Barneveld", status: "UITVOERING", cat: "uitvoering", start: "2026-02-20", opl: "2026-10-05",
    omschrijving: "Vervanging distributienet in de dorpskern. Productie loopt; revisie nog niet bepaald — klaar voor AI-revisieadvies.",
    aiKlaar: "AI-revisieadvies", uitvoering: true,
  },
];

async function maakProject(def) {
  if (await prisma.project.findUnique({ where: { projectnummer: def.nr } })) return false;
  const p = await prisma.project.create({
    data: {
      projectnummer: def.nr, naam: def.naam, opdrachtgever: def.og, type: def.type, plaats: def.plaats,
      omschrijving: def.omschrijving, status: def.status,
      startdatum: def.start ? d(def.start) : null, opleverdatum: def.opl ? d(def.opl) : null,
    },
  });
  await prisma.conditionerendOnderzoek.createMany({
    data: ONDERZOEK[def.cat].map((o) => ({ projectId: p.id, ...o })),
  });

  if (def.uitvoering) {
    const regels = voca(def.type);
    await prisma.vocaRegel.createMany({ data: regels.map((r) => ({ projectId: p.id, ...r, aiGegenereerd: false })) });
    await prisma.materiaalRegel.createMany({
      data: regels.filter((r) => r.categorie === "MATERIAAL").map((r) => ({
        projectId: p.id, artikel: r.omschrijving, eenheid: r.eenheid, hoeveelheid: r.hoeveelheid, eenheidsprijs: r.eenheidsprijs, status: "BESTELD", bron: "VOCA",
      })),
    });
    const posten = regels.filter((r) => r.categorie !== "VERGUNNINGEN");
    await prisma.weekproductie.create({
      data: {
        projectId: p.id, jaar: 2026, week: 10, omschrijving: "Productie week 10", status: "INGEDIEND",
        regels: { create: posten.map((r) => ({ omschrijving: r.omschrijving, eenheid: r.eenheid, gepland: Math.round(r.hoeveelheid * 0.5 * 10) / 10, gerealiseerd: Math.round(r.hoeveelheid * 0.35 * 10) / 10, eenheidsprijs: r.eenheidsprijs })) },
      },
    });
    const G = posten.reduce((s, r) => s + Math.round(r.hoeveelheid * 0.35 * 10) / 10 * r.eenheidsprijs, 0);
    // Eén ingediende termijn van 50% → laat OHW staan; GEEN deelrevisies (AI-klaar).
    await prisma.deelbetaling.create({
      data: { projectId: p.id, termijn: 1, datum: d("2026-04-01"), omschrijving: "Termijn 1 — gerealiseerde productie t/m week 10", bedrag: Math.round(G * 0.5 * 100) / 100, status: "INGEDIEND" },
    });
  }

  await prisma.activiteit.create({
    data: { projectId: p.id, type: "INFO", bericht: `Demo-project aangemaakt (${def.status}). Klaar voor: ${def.aiKlaar}.` },
  });
  return true;
}

async function main() {
  const fixes = [];
  for (const nr of ["HNB-2026-001", "HNB-2026-002"]) {
    const r = await herstelTermijnen(nr);
    if (r) fixes.push(r);
  }
  let nieuw = 0;
  for (const def of DEFS) if (await maakProject(def)) nieuw++;
  console.log("Termijnen hersteld:", JSON.stringify(fixes));
  console.log(`Scriptprojecten nieuw: ${nieuw} · totaal projecten: ${await prisma.project.count()}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

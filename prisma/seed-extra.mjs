// Additief demo-seed: hernoemt de 3 bestaande projecten en voegt 14 extra
// projecten toe met deels-gevulde data. Wist NIETS en is idempotent
// (bestaande projectnummers worden overgeslagen, (demo)-suffix niet dubbel).
//
//   node prisma/seed-extra.mjs
//
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const d = (s) => new Date(s);

// --- Bestaande 3 projecten van een (demo)-label voorzien ---------------------

async function labelBestaande() {
  const bestaand = await prisma.project.findMany({
    where: { projectnummer: { in: ["HNB-2026-001", "HNB-2026-002", "HNB-2026-003"] } },
    select: { id: true, projectnummer: true, naam: true },
  });
  for (const p of bestaand) {
    if (p.naam.includes("(demo")) continue; // al gelabeld
    const suffix = p.projectnummer === "HNB-2026-003" ? " (demo-volledig)" : " (demo)";
    await prisma.project.update({ where: { id: p.id }, data: { naam: p.naam + suffix } });
  }
  return bestaand.length;
}

// --- Datageneratoren per projecttype -----------------------------------------

function vocaRegels(type) {
  const basis = {
    KABELS_ELEKTRA: [
      { omschrijving: "Graven kabelsleuf 0,8 m", categorie: "GRONDWERK", eenheid: "m1", hoeveelheid: 640, eenheidsprijs: 28 },
      { omschrijving: "Leggen LS-kabel 4x150 Al", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 640, eenheidsprijs: 41 },
      { omschrijving: "Aanbrengen mantelbuis kruising", categorie: "MATERIAAL", eenheid: "st", hoeveelheid: 6, eenheidsprijs: 320 },
      { omschrijving: "Herstel open bestrating", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: 420, eenheidsprijs: 36 },
      { omschrijving: "Vergunning / degeneratie", categorie: "VERGUNNINGEN", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 8500 },
    ],
    LEIDINGEN_WATER: [
      { omschrijving: "Graven leidingsleuf 1,2 m", categorie: "GRONDWERK", eenheid: "m1", hoeveelheid: 720, eenheidsprijs: 33 },
      { omschrijving: "Leggen PE-transportleiding Ø250", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 720, eenheidsprijs: 52 },
      { omschrijving: "Aanbrengen appendages / afsluiters", categorie: "MATERIAAL", eenheid: "st", hoeveelheid: 8, eenheidsprijs: 480 },
      { omschrijving: "Gestuurde boring onder watergang", categorie: "ONDERAANNEMER", eenheid: "st", hoeveelheid: 2, eenheidsprijs: 14500 },
      { omschrijving: "Herstel asfaltverharding", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: 310, eenheidsprijs: 34 },
    ],
    COMBI: [
      { omschrijving: "Graven gecombineerde sleuf", categorie: "GRONDWERK", eenheid: "m1", hoeveelheid: 580, eenheidsprijs: 39 },
      { omschrijving: "Leggen MS-kabel 10 kV", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 580, eenheidsprijs: 72.5 },
      { omschrijving: "Leggen PE-drinkwaterleiding Ø200", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: 580, eenheidsprijs: 58 },
      { omschrijving: "Mof- en lasverbindingen", categorie: "MATERIEEL", eenheid: "st", hoeveelheid: 12, eenheidsprijs: 210 },
      { omschrijving: "Herstel asfaltverharding", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: 360, eenheidsprijs: 34 },
    ],
  };
  return basis[type] ?? basis.COMBI;
}

function onderzoekenVoor(categorie) {
  // categorie: 'nieuw' | 'lopend' | 'gereed'
  const perCat = {
    nieuw: [
      { type: "KLIC", status: "AANGEVRAAGD", uitvoerder: "Kadaster", verplicht: true },
      { type: "BODEM_VERKENNEND", status: "NOG_AAN_TE_VRAGEN", uitvoerder: "Tauw", verplicht: true },
      { type: "FLORA_FAUNA", status: "AANGEVRAAGD", uitvoerder: "Eelerwoude", verplicht: true },
    ],
    lopend: [
      { type: "KLIC", status: "ONTVANGEN", uitvoerder: "Kadaster", verplicht: true, kosten: 180 },
      { type: "GEOTECHNIEK", status: "BEOORDEELD", uitvoerder: "Wiertsema & Partners", verplicht: false, kosten: 6400 },
      { type: "FLORA_FAUNA", status: "BEOORDEELD", uitvoerder: "Eelerwoude", verplicht: true, kosten: 4100 },
      { type: "VERHARDING", status: "ONTVANGEN", uitvoerder: "Kiwa KOAC", verplicht: false, kosten: 2900 },
    ],
    gereed: [
      { type: "KLIC", status: "BEOORDEELD", uitvoerder: "Kadaster", verplicht: true, kosten: 180 },
      { type: "BODEM_MILIEU", status: "BEOORDEELD", uitvoerder: "Tauw", verplicht: true, kosten: 5200 },
      { type: "ARCHEOLOGIE", status: "BEOORDEELD", uitvoerder: "RAAP", verplicht: false, kosten: 7300 },
      { type: "FLORA_FAUNA", status: "BEOORDEELD", uitvoerder: "Eelerwoude", verplicht: true, kosten: 4100 },
    ],
  };
  return perCat[categorie];
}

function materiaalVoor(type, status) {
  const art = {
    KABELS_ELEKTRA: [["LS-kabel 4x150 Al", "m1", 650, "TKF"], ["Mantelbuis PE Ø110", "m1", 90, "Wavin"], ["Kabelmof 4x150", "st", 14, "Nexans"]],
    LEIDINGEN_WATER: [["PE-leiding PE100 Ø250", "m1", 740, "Wavin"], ["Afsluiter DN200", "st", 8, "AVK"], ["Overgangskoppeling", "st", 20, "Georg Fischer"]],
    COMBI: [["MS-kabel 10 kV", "m1", 600, "Prysmian"], ["PE-drinkwaterleiding Ø200", "m1", 600, "Wavin"], ["Lasmof MS", "st", 12, "Nexans"]],
  };
  return (art[type] ?? art.COMBI).map(([artikel, eenheid, hoeveelheid, leverancier]) => ({
    artikel, eenheid, hoeveelheid, leverancier, status, bron: "VOCA",
  }));
}

// Weekproducties afgeleid van de VOCA (excl. vergunningen), met realisatiegraad.
function weekproductiesVoor(voca, jaar, weken, realisatieGraad) {
  const posten = voca.filter((v) => v.categorie !== "VERGUNNINGEN");
  return weken.map((week, wi) => ({
    jaar,
    week,
    omschrijving: `Productie week ${week}`,
    status: wi < weken.length - 1 ? "GOEDGEKEURD" : "INGEDIEND",
    regels: {
      create: posten.map((v) => {
        const gepland = Math.round((v.hoeveelheid / weken.length) * 10) / 10;
        return {
          omschrijving: v.omschrijving,
          eenheid: v.eenheid,
          gepland,
          gerealiseerd: Math.round(gepland * realisatieGraad * 10) / 10,
          eenheidsprijs: v.eenheidsprijs,
        };
      }),
    },
  }));
}

function som(weekproducties) {
  return weekproducties.reduce(
    (s, w) => s + w.regels.create.reduce((a, r) => a + r.gerealiseerd * r.eenheidsprijs, 0),
    0,
  );
}

// --- 14 projectdefinities ----------------------------------------------------

const DEFS = [
  // 5 gereed (afgerond, vorig jaar)
  { nr: "HNB-2025-011", naam: "Renovatie LS-net centrum Deventer", og: "Enexis", type: "KABELS_ELEKTRA", plaats: "Deventer", cat: "gereed", start: "2025-02-10", opl: "2025-07-18" },
  { nr: "HNB-2025-012", naam: "Nieuwe drinkwaterleiding Zuidplaspolder", og: "Oasen", type: "LEIDINGEN_WATER", plaats: "Moordrecht", cat: "gereed", start: "2025-03-03", opl: "2025-09-05" },
  { nr: "HNB-2025-013", naam: "Combitracé bedrijventerrein De Hoef", og: "Stedin & PWN", type: "COMBI", plaats: "Alkmaar", cat: "gereed", start: "2025-01-20", opl: "2025-08-29" },
  { nr: "HNB-2025-014", naam: "Verzwaring MS-ring ziekenhuis", og: "Liander", type: "KABELS_ELEKTRA", plaats: "Zwolle", cat: "gereed", start: "2025-04-07", opl: "2025-10-10" },
  { nr: "HNB-2025-015", naam: "Sanering gietijzeren waterleiding", og: "Brabant Water", type: "LEIDINGEN_WATER", plaats: "Tilburg", cat: "gereed", start: "2025-02-24", opl: "2025-07-31" },
  // 5 lopend (uitvoering / revisie, dit jaar)
  { nr: "HNB-2026-004", naam: "Aanleg laadinfra parkeergarage Centrum", og: "Stedin", type: "KABELS_ELEKTRA", plaats: "Utrecht", cat: "lopend", status: "UITVOERING", start: "2026-02-02", opl: "2026-08-14" },
  { nr: "HNB-2026-005", naam: "Vervanging hoofdwaterleiding Dorpsstraat", og: "Vitens", type: "LEIDINGEN_WATER", plaats: "Ede", cat: "lopend", status: "UITVOERING", start: "2026-03-09", opl: "2026-09-25" },
  { nr: "HNB-2026-006", naam: "Combitracé woonwijk Reeshof-Noord", og: "Enexis & Brabant Water", type: "COMBI", plaats: "Tilburg", cat: "lopend", status: "REVISIE", start: "2026-01-19", opl: "2026-07-03" },
  { nr: "HNB-2026-007", naam: "MS-verbinding windpark aansluiting", og: "Liander", type: "KABELS_ELEKTRA", plaats: "Dronten", cat: "lopend", status: "UITVOERING", start: "2026-04-06", opl: "2026-11-20" },
  { nr: "HNB-2026-008", naam: "Transportleiding koppeling pompstation", og: "PWN", type: "LEIDINGEN_WATER", plaats: "Heerhugowaard", cat: "lopend", status: "REVISIE", start: "2026-02-16", opl: "2026-08-30" },
  // 4 nieuw (intake / voorbereiding)
  { nr: "HNB-2026-009", naam: "Nieuwbouwwijk Stationspark fase 1", og: "Stedin & Oasen", type: "COMBI", plaats: "Gouda", cat: "nieuw", status: "VOORBEREIDING", start: "2026-09-01", opl: "2027-05-30" },
  { nr: "HNB-2026-010", naam: "Verzwaring LS-net sportcampus", og: "Enexis", type: "KABELS_ELEKTRA", plaats: "Eindhoven", cat: "nieuw", status: "INTAKE" },
  { nr: "HNB-2026-011", naam: "Aanleg bluswaterleiding industrie", og: "Brabant Water", type: "LEIDINGEN_WATER", plaats: "Moerdijk", cat: "nieuw", status: "VOORBEREIDING", start: "2026-10-05" },
  { nr: "HNB-2026-012", naam: "Combitracé herinrichting Marktplein", og: "Liander & Vitens", type: "COMBI", plaats: "Apeldoorn", cat: "nieuw", status: "INTAKE" },
];

async function maakProject(def) {
  const bestaat = await prisma.project.findUnique({ where: { projectnummer: def.nr } });
  if (bestaat) return false;

  const status = def.status ?? (def.cat === "gereed" ? "AFGEROND" : def.cat === "lopend" ? "UITVOERING" : "INTAKE");
  const voca = vocaRegels(def.type);
  const toonVoca = def.cat !== "nieuw" || status === "VOORBEREIDING"; // intake nog geen VOCA

  const project = await prisma.project.create({
    data: {
      projectnummer: def.nr,
      naam: def.naam + " (demo)",
      opdrachtgever: def.og,
      type: def.type,
      plaats: def.plaats,
      omschrijving: `Demo-project ${def.nr} — ${def.plaats}. Automatisch gegenereerde voorbeelddata (deels gevuld).`,
      status,
      startdatum: def.start ? d(def.start) : null,
      opleverdatum: def.opl ? d(def.opl) : null,
    },
  });

  // Onderzoeken (alle categorieën)
  await prisma.conditionerendOnderzoek.createMany({
    data: onderzoekenVoor(def.cat).map((o) => ({ projectId: project.id, ...o, aanvraagdatum: def.start ? d(def.start) : null })),
  });

  // VOCA
  if (toonVoca) {
    await prisma.vocaRegel.createMany({ data: voca.map((v) => ({ projectId: project.id, ...v })) });
  }

  // Lopend + gereed: materiaal, weekproducties, deelbetalingen
  if (def.cat === "lopend" || def.cat === "gereed") {
    const matStatus = def.cat === "gereed" ? "GELEVERD" : "BESTELD";
    await prisma.materiaalRegel.createMany({ data: materiaalVoor(def.type, matStatus).map((m) => ({ projectId: project.id, ...m })) });

    const jaar = def.cat === "gereed" ? 2025 : 2026;
    const weken = def.cat === "gereed" ? [18, 20, 22, 24] : [8, 10, 12];
    const graad = def.cat === "gereed" ? 1 : 0.55;
    const wps = weekproductiesVoor(voca, jaar, weken, graad);
    for (const w of wps) await prisma.weekproductie.create({ data: { projectId: project.id, ...w } });

    const gerealiseerd = som(wps);
    if (def.cat === "gereed") {
      const t1 = Math.round(gerealiseerd * 0.6 * 100) / 100;
      const t2 = Math.round((gerealiseerd - t1) * 100) / 100;
      await prisma.deelbetaling.createMany({
        data: [
          { projectId: project.id, termijn: 1, datum: d(`${jaar}-06-15`), omschrijving: "Termijn 1 — tussentijdse opname", bedrag: t1, status: "BETAALD" },
          { projectId: project.id, termijn: 2, datum: d(`${jaar}-09-10`), omschrijving: "Termijn 2 — eindafrekening", bedrag: t2, status: "BETAALD" },
        ],
      });
      await prisma.deelrevisie.createMany({
        data: [
          { projectId: project.id, deel: "Tracé as-built", omschrijving: "Revisietekening ingemeten", status: "GOEDGEKEURD", datum: d(`${jaar}-09-20`) },
          { projectId: project.id, deel: "Aansluitingen", omschrijving: "Mof- en aansluitstaat", status: "GOEDGEKEURD", datum: d(`${jaar}-09-25`) },
        ],
      });
    } else {
      // lopend: 1 ingediende/goedgekeurde termijn + 1 concept
      const t1 = Math.round(gerealiseerd * 0.5 * 100) / 100;
      await prisma.deelbetaling.createMany({
        data: [
          { projectId: project.id, termijn: 1, datum: d("2026-03-20"), omschrijving: "Termijn 1 — gerealiseerde productie t/m week 10", bedrag: t1, status: def.status === "REVISIE" ? "GOEDGEKEURD" : "INGEDIEND" },
          { projectId: project.id, termijn: 2, datum: null, omschrijving: "Termijn 2 — concept", bedrag: Math.round((gerealiseerd - t1) * 100) / 100, status: "CONCEPT" },
        ],
      });
      if (def.status === "REVISIE") {
        await prisma.deelrevisie.create({ data: { projectId: project.id, deel: "Tracé as-built", omschrijving: "Inmeting gereed, controle loopt", status: "IN_BEWERKING" } });
      }
    }
  }

  // Activiteit
  await prisma.activiteit.create({
    data: { projectId: project.id, type: "INFO", bericht: `Demo-project aangemaakt (${def.cat}).` },
  });

  return true;
}

async function main() {
  const gelabeld = await labelBestaande();
  let nieuw = 0;
  for (const def of DEFS) if (await maakProject(def)) nieuw++;
  const totaal = await prisma.project.count();
  console.log(`Bestaande gelabeld: ${gelabeld} · nieuw aangemaakt: ${nieuw} · totaal projecten: ${totaal}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

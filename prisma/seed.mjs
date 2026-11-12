import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Schoon bij herseed
  await prisma.activiteit.deleteMany();
  await prisma.document.deleteMany();
  await prisma.conditionerendOnderzoek.deleteMany();
  await prisma.project.deleteMany();

  const p1 = await prisma.project.create({
    data: {
      projectnummer: "HNB-2025-014",
      naam: "Renovatie drinkwaterleiding Dorpsstraat",
      opdrachtgever: "Waterbedrijf Vitens",
      type: "LEIDINGEN_WATER",
      plaats: "Nijkerk",
      omschrijving:
        "Vervanging ca. 1,2 km AC-waterleiding door PE in bestaande rijbaan, inclusief huisaansluitingen.",
      status: "INTAKE",
      startdatum: new Date("2026-02-01"),
      opleverdatum: new Date("2026-06-30"),
      onderzoeken: {
        create: [
          {
            type: "KLIC",
            titel: "KLIC-melding tracé Dorpsstraat",
            status: "ONTVANGEN",
            uitvoerder: "Kadaster",
            aanvraagdatum: new Date("2025-11-20"),
            ontvangstdatum: new Date("2025-11-22"),
            verplicht: true,
          },
          {
            type: "BODEM_MILIEU",
            titel: "Verkennend milieukundig bodemonderzoek (NEN 5740)",
            status: "AANGEVRAAGD",
            uitvoerder: "Ortageo",
            aanvraagdatum: new Date("2025-11-25"),
            verwachtKlaar: new Date("2025-12-19"),
            verplicht: true,
          },
          {
            type: "VERHARDING",
            titel: "Verhardingsonderzoek asfalt rijbaan",
            status: "NOG_AAN_TE_VRAGEN",
            verplicht: false,
          },
        ],
      },
      activiteiten: {
        create: [
          { type: "STATUS", bericht: "Project aangemaakt in intakefase." },
          { type: "INFO", bericht: "KLIC-melding ontvangen en gekoppeld aan dossier." },
        ],
      },
    },
  });

  await prisma.project.create({
    data: {
      projectnummer: "HNB-2025-021",
      naam: "Aanleg MS-kabeltracé bedrijventerrein De Hoef",
      opdrachtgever: "Liander",
      type: "KABELS_ELEKTRA",
      plaats: "Amersfoort",
      omschrijving:
        "Nieuw 10kV middenspanningstracé ca. 800 m incl. gestuurde boring onder watergang.",
      status: "VOORBEREIDING",
      startdatum: new Date("2026-03-15"),
      opleverdatum: new Date("2026-07-15"),
      onderzoeken: {
        create: [
          {
            type: "KLIC",
            titel: "KLIC-melding MS-tracé De Hoef",
            status: "ONTVANGEN",
            uitvoerder: "Kadaster",
            ontvangstdatum: new Date("2025-10-30"),
            verplicht: true,
          },
          {
            type: "NGE",
            titel: "Vooronderzoek ontplofbare oorlogsresten (OOO)",
            status: "IN_UITVOERING",
            uitvoerder: "Saricon",
            aanvraagdatum: new Date("2025-10-15"),
            verwachtKlaar: new Date("2025-12-05"),
            verplicht: true,
          },
          {
            type: "FLORA_FAUNA",
            titel: "Quickscan Wet natuurbescherming",
            status: "BEOORDEELD",
            uitvoerder: "Bureau Waardenburg",
            ontvangstdatum: new Date("2025-09-28"),
            verplicht: true,
          },
          {
            type: "GEOTECHNIEK",
            titel: "Sonderingen t.b.v. gestuurde boring",
            status: "AANGEVRAAGD",
            uitvoerder: "Fugro",
            aanvraagdatum: new Date("2025-11-18"),
            verwachtKlaar: new Date("2025-12-12"),
            verplicht: true,
          },
        ],
      },
      activiteiten: {
        create: [
          { type: "STATUS", bericht: "Overgegaan naar voorbereiding." },
          { type: "WAARSCHUWING", bericht: "NGE-vooronderzoek bepaalt kritieke pad planning." },
        ],
      },
    },
  });

  console.log("Seed klaar. Voorbeeldprojecten aangemaakt:", p1.projectnummer, "+ 1 meer.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

# HANAB BMS

Bedrijfsmanagementsysteem voor ondergrondse infra (kabels elektra & leidingen water).
Lokale ontwikkelversie. Eerste module: **intakeproces — conditionerende onderzoeken** met AI-ondersteuning.

## Stack

- **Next.js 14** (App Router, Server Actions) + **TypeScript**
- **Prisma** + **SQLite** (lokale `prisma/dev.db`)
- **Tailwind CSS** in HANAB-huisstijl (navy `#00214b` / rood accent `#e63223`)
- **Claude API** (`@anthropic-ai/sdk`, model `claude-opus-4-8`) voor het AI-advies, met
  ingebouwde lokale kennisregel-fallback zodat alles werkt zonder API-sleutel.

## Starten

```bash
npm install
npm run setup     # prisma generate + db push + seed (voorbeeldprojecten)
npm run dev       # http://localhost:3000
```

Overige scripts: `npm run db:studio` (Prisma Studio), `npm run db:reset` (schema + herseed),
`npm run build` / `npm run start` (productie).

## AI inschakelen (optioneel)

Zonder sleutel draait de AI op lokale kennisregels. Voor echte Claude-aanvragen zijn
er twee manieren:

1. **In de app** — ga naar **Instellingen** (navbalk), plak je Anthropic API-sleutel
   en klik **Opslaan**. Met **Verbinding testen** check je direct of hij werkt. De
   sleutel wordt lokaal in de database bewaard.
2. **Via omgeving** — zet `ANTHROPIC_API_KEY="sk-ant-..."` in `.env`.

De app leest eerst de sleutel uit de instellingen, anders uit de omgeving; zonder
sleutel (of bij een fout) valt alles terug op de lokale regels. Het model is
instelbaar (standaard `claude-opus-4-8`).

## Functionaliteit (huidige module)

- Dashboard met KPI's en projectoverzicht + voortgang onderzoeken.
- Project aanmaken met scope-omschrijving.
- Projectdetail = intakemodule:
  - **AI-onderzoeksadvies**: genereert op basis van type/scope een lijst benodigde
    conditionerende onderzoeken (KLIC, bodem/milieu, OOO/NGE, flora & fauna, geotechniek,
    verharding, bemaling, archeologie) mét onderbouwing en indicatieve doorlooptijd.
  - **Aanvragen & monitoren**: per onderzoek status, uitvoerder, data; statusovergangen
    stempelen automatisch aanvraag-/ontvangstdatum.
  - **AI-monitoring**: beknopte risico-/voortgangsduiding op lopende onderzoeken.
  - **Voorcalculatie (VOCA)**: AI genereert een begroting (regels met hoeveelheid ×
    eenheidsprijs, per categorie) uit de scope; totaalraming + handmatige regels.
  - **Materiaal Bestellingen Bestand (MBB)**: materiaalregels worden afgeleid uit de
    VOCA (categorie Materiaal) of door AI gegenereerd; per artikel status
    (te bestellen → besteld → geleverd).
  - **Werktekeningen**: AI bepaalt de benodigde tekeningen (tracé, dwarsprofiel,
    detail, boorprofiel); status CONCEPT → IN_REVIEW → GOEDGEKEURD → DEFINITIEF.
  - **Projectdossier & documenten**: genereert alle dossierstukken onder
    `public/docs/<projectnummer>/` en registreert ze als downloadbare documenten:
    een geconsolideerde **Projectdossier.pdf** (pdfkit) en **Projectdossier.docx**
    (docx) in HANAB-huisstijl, plus losse stukken (HTML printbaar + CSV):
    bureauonderzoek, onderzoeken, VOCA (+CSV), MBB (+CSV), werktekeningen,
    weekstaten, termijnstaat, deelrevisies. PDF én Word worden uit één gedeeld
    datamodel (`src/lib/dossier-model.ts`) gerenderd; de PDF heeft het HANAB-logo
    in de kop en een voettekst met paginanummers. Alles is ook te downloaden als
    één **Projectdossier.zip** (archiver).
  - Activiteiten- & AI-logboek per project.

Het projectscherm heeft drie tabs: **Intake & voorbereiding**, **Kaart & bureauonderzoek** en **Uitvoering**.

### Kaart & bureauonderzoek (open data)

- **Tracé intekenen** op een kaart (Leaflet + PDOK BRT-achtergrondkaart).
- **Bureauonderzoek** raadpleegt langs het tracé landelijke **open data** (keyless):
  - Geotechniek → **BRO sonderingen (CPT)**
  - Water → **BRO grondwatermonitoring (GMW)**
  - Natuur → **PDOK Natura 2000**
  - Bodem & milieu (Bodemloket) en Archeologie hebben geen publieke keyless API →
    eerlijk gemarkeerd als *handmatig* met verwijzing naar het officiële loket.
- **AI** vat de bevindingen samen tot een bureauonderzoeksrapport met conclusie +
  aanbevolen vervolgonderzoek (Claude, of lokale template zonder sleutel).
- **Zet in onderzoekenlijst**: knop die de bevindingen omzet in concrete
  conditionerende onderzoeken op de Intake-tab (met onderbouwing uit het
  bureauonderzoek; verplicht/aanbevolen afhankelijk van de gevonden data).
- ⚠️ Deze tab vereist **internet** tijdens gebruik (kaarttegels + open-data-API's);
  de rest van de app werkt lokaal.

### Uitvoering (repeterende administratie)

- **Weekproducties**: regels worden automatisch voorgevuld vanuit de voorcalculatie;
  alleen gerealiseerde hoeveelheden invullen. Productie per week wordt berekend.
- **Deelbetalingen (termijnstaat)**: termijnbedrag wordt **deterministisch** berekend
  uit de gerealiseerde productie minus eerder gefactureerd (geen AI-gok op geld).
  KPI's: gerealiseerd / gefactureerd / nog te factureren.
- **Deelrevisies**: AI adviseert de benodigde as-built delen; status per deel.

## Datamodel (`prisma/schema.prisma`)

`Project` (+ `traceGeoJson`) → `ConditionerendOnderzoek`, `VocaRegel`, `MateriaalRegel`,
`Werktekening`, `Weekproductie` (+ `WeekproductieRegel`), `Deelbetaling`, `Deelrevisie`,
`Bureauonderzoek`, `Document`, `Activiteit`. Enum-waarden en labels staan centraal in
`src/lib/domein.ts`; de open-data-bevraging in `src/lib/opendata.ts`.

## Ontwerpkeuze AI vs. deterministisch

AI (Claude + lokale fallback) wordt ingezet voor **advies/opstellen** (onderzoeken,
VOCA, MBB, werktekeningen, deelrevisies). Geldberekeningen (weekproductie → termijn)
zijn **deterministisch** — repeterende administratie moet exact en reproduceerbaar zijn.

## Roadmap

Alle door de opdrachtgever genoemde intake- en uitvoeringsmodules zijn gebouwd.
### Demo: 3 volledig doorlopen projecten

`GET /api/demo-dossiers` maakt 3 combi-projecten (water + elektra, ~500 m tracé op
3 locaties), doorloopt ze volledig (alle modules gevuld, status Afgerond, live
bureauonderzoek) en genereert per project alle dossierdocumenten. Eénmalig aanroepen:

```bash
curl http://localhost:3000/api/demo-dossiers
```

Documenten per project kun je ook (her)genereren met de knop **Genereer
dossierdocumenten** op de Intake-tab.

Mogelijke uitbreidingen: documenten uploaden/koppelen, echte PDF/Word-export, en
koppeling met de eigen stack.

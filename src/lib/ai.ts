// AI-laag voor HANAB BMS.
//
// Twee functies ondersteunen het intakeproces voor ondergrondse infra:
//  1. onderzoeksadvies(): welke conditionerende onderzoeken zijn nodig voor
//     dit project, met onderbouwing en indicatieve doorlooptijd.
//  2. monitoringSamenvatting(): korte risico-/voortgangsduiding op de lopende
//     onderzoeken.
//
// Beide werken met de Claude API wanneer ANTHROPIC_API_KEY is gezet, en vallen
// anders terug op een ingebouwde, deterministische kennisregel-fallback zodat
// de applicatie volledig lokaal werkt zonder sleutel.

import {
  ONDERZOEK_TYPES,
  type OnderzoekType,
  labelOnderzoek,
  labelOnderzoekStatus,
  labelProjectType,
} from "./domein";
import { getApiKey, getModel } from "./settings";

export type AdviesBron = "claude" | "lokaal";

export interface OnderzoekAdvies {
  type: OnderzoekType;
  titel: string;
  verplicht: boolean;
  rationale: string;
  doorlooptijdWeken: number;
}

export interface AdviesResultaat {
  bron: AdviesBron;
  adviezen: OnderzoekAdvies[];
}

export interface MonitoringResultaat {
  bron: AdviesBron;
  tekst: string;
}

export interface ProjectContext {
  naam: string;
  type: string;
  plaats?: string | null;
  omschrijving?: string | null;
  opdrachtgever?: string | null;
  bestaandeOnderzoeken?: { type: string; status: string; verwachtKlaar?: Date | null; titel?: string | null }[];
}

async function heeftSleutel(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

// Lazy import zodat de SDK alleen geladen wordt wanneer nodig. Sleutel komt uit
// de instellingen (DB) of anders uit de omgeving.
async function getClient() {
  const key = await getApiKey();
  const mod = await import("@anthropic-ai/sdk");
  const Anthropic = mod.default;
  // Harde timeout + geen retries: een trage AI-call faalt snel en valt terug op
  // de lokale generator i.p.v. de UI (App Router) minutenlang te blokkeren.
  return new Anthropic({ apiKey: key ?? undefined, timeout: 45_000, maxRetries: 0 });
}

/**
 * Haalt een JSON-array uit een tekstrespons. Robuust tegen codeblokken,
 * omringende tekst en — belangrijk — tegen afgekapte JSON (bijv. als een
 * thinking-blok een deel van max_tokens opslokt). Verzamelt in dat geval de
 * losse, complete {…}-objecten i.p.v. alles te laten mislukken.
 */
function parseJsonArray(text: string): any[] | null {
  const schoon = text.replace(/```json/gi, "```").replace(/```/g, "").trim();
  const start = schoon.indexOf("[");
  if (start === -1) return null;

  // Snelle route: de hele array parst in één keer.
  const eind = schoon.lastIndexOf("]");
  if (eind > start) {
    try {
      const parsed = JSON.parse(schoon.slice(start, eind + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* val terug op de tolerante scanner hieronder */
    }
  }

  // Tolerante route: loop door de tekst en verzamel elk compleet top-level
  // {…}-object. Een afgekapt laatste object wordt simpelweg overgeslagen.
  const objecten: any[] = [];
  let diepte = 0;
  let objStart = -1;
  let inString = false;
  let escape = false;
  for (let i = start + 1; i < schoon.length; i++) {
    const c = schoon[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") {
      if (diepte === 0) objStart = i;
      diepte++;
    } else if (c === "}") {
      if (diepte > 0) diepte--;
      if (diepte === 0 && objStart !== -1) {
        try {
          objecten.push(JSON.parse(schoon.slice(objStart, i + 1)));
        } catch {
          /* sla onparseerbaar object over */
        }
        objStart = -1;
      }
    }
  }
  return objecten.length ? objecten : null;
}

// ---------------------------------------------------------------------------
// 1. Onderzoeksadvies
// ---------------------------------------------------------------------------

export async function onderzoeksadvies(ctx: ProjectContext): Promise<AdviesResultaat> {
  if ((await heeftSleutel())) {
    try {
      return await onderzoeksadviesClaude(ctx);
    } catch (e) {
      console.error("AI-advies via Claude mislukt, val terug op lokaal:", e);
    }
  }
  return { bron: "lokaal", adviezen: lokaalAdvies(ctx) };
}

async function onderzoeksadviesClaude(ctx: ProjectContext): Promise<AdviesResultaat> {
  const client = await getClient();
  const geldigeTypes = Object.keys(ONDERZOEK_TYPES).join(", ");

  const systemPrompt =
    "Je bent een ervaren werkvoorbereider ondergrondse infra (kabels elektra en " +
    "leidingen water) bij een Nederlandse aannemer. Je adviseert welke " +
    "conditionerende onderzoeken nodig zijn in de intakefase van een project. " +
    "Je kent KLIC, bodem- en milieuonderzoek, OOO/NGE, Wet natuurbescherming, " +
    "geotechniek, verhardingsonderzoek, archeologie en bemaling. Wees concreet " +
    "en praktisch; baseer je op Nederlandse praktijk en regelgeving.";

  const userPrompt = [
    "Beoordeel dit project en geef een advieslijst van benodigde conditionerende onderzoeken.",
    "",
    `Projectnaam: ${ctx.naam}`,
    `Type werk: ${labelProjectType(ctx.type)}`,
    ctx.plaats ? `Locatie: ${ctx.plaats}` : null,
    ctx.opdrachtgever ? `Opdrachtgever: ${ctx.opdrachtgever}` : null,
    ctx.omschrijving ? `Omschrijving: ${ctx.omschrijving}` : null,
    "",
    `Geef UITSLUITEND een JSON-array terug. Elk element: {"type": <een van: ${geldigeTypes}>, "titel": <korte NL titel>, "verplicht": <true|false>, "rationale": <1-2 zinnen waarom, projectspecifiek>, "doorlooptijdWeken": <schatting geheel getal>}.`,
    "Gebruik alleen de toegestane type-waarden. Geen tekst buiten de JSON-array.",
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await client.messages.create({
    model: await getModel(),
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const tekst = resp.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  const rows = parseJsonArray(tekst);
  if (!rows) throw new Error("Kon AI-advies niet parsen");

  const geldig = new Set(Object.keys(ONDERZOEK_TYPES));
  const adviezen: OnderzoekAdvies[] = rows
    .filter((r) => r && geldig.has(r.type))
    .map((r) => ({
      type: r.type as OnderzoekType,
      titel: String(r.titel ?? labelOnderzoek(r.type)),
      verplicht: Boolean(r.verplicht),
      rationale: String(r.rationale ?? ""),
      doorlooptijdWeken: Number.isFinite(r.doorlooptijdWeken) ? Math.round(r.doorlooptijdWeken) : 4,
    }));

  if (adviezen.length === 0) throw new Error("Leeg AI-advies");
  return { bron: "claude", adviezen };
}

// ---------------------------------------------------------------------------
// 2. Monitoringsamenvatting
// ---------------------------------------------------------------------------

export async function monitoringSamenvatting(ctx: ProjectContext): Promise<MonitoringResultaat> {
  if ((await heeftSleutel()) && (ctx.bestaandeOnderzoeken?.length ?? 0) > 0) {
    try {
      return await monitoringClaude(ctx);
    } catch (e) {
      console.error("AI-monitoring via Claude mislukt, val terug op lokaal:", e);
    }
  }
  return { bron: "lokaal", tekst: lokaleMonitoring(ctx) };
}

async function monitoringClaude(ctx: ProjectContext): Promise<MonitoringResultaat> {
  const client = await getClient();
  const regels = (ctx.bestaandeOnderzoeken ?? [])
    .map(
      (o) =>
        `- ${labelOnderzoek(o.type)} — status: ${o.status}` +
        (o.verwachtKlaar ? ` — verwacht klaar: ${o.verwachtKlaar.toISOString().slice(0, 10)}` : "")
    )
    .join("\n");

  const resp = await client.messages.create({
    model: await getModel("snel"),
    max_tokens: 700,
    system:
      "Je bent werkvoorbereider ondergrondse infra. Geef een beknopte, zakelijke " +
      "voortgangs- en risicoduiding op de conditionerende onderzoeken. Noem wat " +
      "op het kritieke pad staat en welke actie nodig is. Max 4 zinnen, Nederlands.",
    messages: [
      {
        role: "user",
        content:
          `Project: ${ctx.naam} (${labelProjectType(ctx.type)})${
            ctx.plaats ? ", " + ctx.plaats : ""
          }\n\nOnderzoeken:\n${regels}\n\nGeef de duiding.`,
      },
    ],
  });

  const tekst = resp.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();

  if (!tekst) throw new Error("Lege monitoringrespons");
  return { bron: "claude", tekst };
}

// ---------------------------------------------------------------------------
// Lokale fallback — kennisregels ondergrondse infra
// ---------------------------------------------------------------------------

function lokaalAdvies(ctx: ProjectContext): OnderzoekAdvies[] {
  const o = (ctx.omschrijving ?? "").toLowerCase();
  const isWater = ctx.type === "LEIDINGEN_WATER" || ctx.type === "COMBI";
  const isKabel = ctx.type === "KABELS_ELEKTRA" || ctx.type === "COMBI";
  const noemtBoring = /borin|hdd|gestuurd|persing/.test(o);
  const noemtRijbaan = /rijbaan|asfalt|verharding|weg|straat/.test(o);
  const noemtGrondwater = /grondwater|bemaling|sleuf|diep/.test(o);

  const a: OnderzoekAdvies[] = [];

  a.push({
    type: "KLIC",
    titel: "KLIC-melding (graafmelding) tracé",
    verplicht: true,
    rationale:
      "Wettelijk verplichte graafmelding (WIBON) voor elk graafwerk; geeft ligging bestaande kabels en leidingen.",
    doorlooptijdWeken: 1,
  });

  a.push({
    type: "BODEM_MILIEU",
    titel: "Verkennend milieukundig bodemonderzoek (NEN 5740)",
    verplicht: true,
    rationale:
      "Nodig om vrijkomende grond af te kunnen voeren/toepassen en veilig te werken; vaak vergunningvoorwaarde.",
    doorlooptijdWeken: 4,
  });

  if (isKabel) {
    a.push({
      type: "NGE",
      titel: "Vooronderzoek ontplofbare oorlogsresten (OOO/NGE)",
      verplicht: true,
      rationale:
        "Bij grondroerende werkzaamheden standaard vooronderzoek; bepaalt of detectie/benadering nodig is en zit vaak op het kritieke pad.",
      doorlooptijdWeken: 5,
    });
    a.push({
      type: "FLORA_FAUNA",
      titel: "Quickscan Wet natuurbescherming",
      verplicht: true,
      rationale:
        "Beoordeling beschermde soorten/gebieden langs het tracé; kan leiden tot aanvullend onderzoek of ontheffing.",
      doorlooptijdWeken: 4,
    });
  }

  if (isWater) {
    a.push({
      type: "WATER_BEMALING",
      titel: "Bemalingsadvies / watervergunning (BWO)",
      verplicht: noemtGrondwater,
      rationale:
        "Vervangen/aanleggen leidingen in natte sleuf vereist meestal bemaling; check lozing en meldings-/vergunningplicht.",
      doorlooptijdWeken: 3,
    });
  }

  if (noemtBoring) {
    a.push({
      type: "GEOTECHNIEK",
      titel: "Sonderingen t.b.v. gestuurde boring/persing",
      verplicht: true,
      rationale:
        "Bodemopbouw bepaalt haalbaarheid en ontwerp van de boring; nodig voor boorprofiel en risicobeheersing.",
      doorlooptijdWeken: 3,
    });
  }

  if (noemtRijbaan || isWater) {
    a.push({
      type: "VERHARDING",
      titel: "Verhardingsonderzoek bestaande verharding",
      verplicht: false,
      rationale:
        "Inzicht in opbouw/dikte asfalt en teerhoudendheid voor herstel en afvoer; relevant bij werk in de rijbaan.",
      doorlooptijdWeken: 3,
    });
  }

  a.push({
    type: "ARCHEOLOGIE",
    titel: "Archeologische bureaustudie (check gemeentelijke beleidskaart)",
    verplicht: false,
    rationale:
      "Toets of het tracé in een gebied met archeologische verwachting ligt; alleen veldwerk bij hoge verwachting.",
    doorlooptijdWeken: 3,
  });

  return a;
}

// ---------------------------------------------------------------------------
// 3. Voorcalculatie (VOCA)
// ---------------------------------------------------------------------------

export interface VocaRegelAdvies {
  omschrijving: string;
  categorie: string; // VERGUNNINGEN | GRONDWERK | MATERIAAL | MATERIEEL | ONDERAANNEMER | HERSTEL | OVERIG
  eenheid: string; // m1 | m2 | m3 | st | uur | post
  hoeveelheid: number;
  eenheidsprijs: number;
}

export interface VocaResultaat {
  bron: AdviesBron;
  regels: VocaRegelAdvies[];
}

const VOCA_CATS = ["VERGUNNINGEN", "GRONDWERK", "MATERIAAL", "MATERIEEL", "ONDERAANNEMER", "HERSTEL", "OVERIG"];
const VOCA_EENHEDEN = ["m1", "m2", "m3", "st", "uur", "post"];

export async function voorcalculatieAdvies(ctx: ProjectContext): Promise<VocaResultaat> {
  if ((await heeftSleutel())) {
    try {
      return await vocaClaude(ctx);
    } catch (e) {
      console.error("AI-voorcalculatie via Claude mislukt, val terug op lokaal:", e);
    }
  }
  return { bron: "lokaal", regels: lokaleVoca(ctx) };
}

async function vocaClaude(ctx: ProjectContext): Promise<VocaResultaat> {
  const client = await getClient();
  const userPrompt = [
    "Stel een voorcalculatie (begroting) op voor dit project ondergrondse infra.",
    `Projectnaam: ${ctx.naam}`,
    `Type werk: ${labelProjectType(ctx.type)}`,
    ctx.plaats ? `Locatie: ${ctx.plaats}` : null,
    ctx.omschrijving ? `Omschrijving: ${ctx.omschrijving}` : null,
    "",
    `Geef UITSLUITEND een JSON-array. Elk element: {"omschrijving": <string>, "categorie": <een van: ${VOCA_CATS.join(", ")}>, "eenheid": <een van: ${VOCA_EENHEDEN.join(", ")}>, "hoeveelheid": <getal>, "eenheidsprijs": <euro per eenheid, getal>}.`,
    "Gebruik realistische Nederlandse richtprijzen. Dek vergunningen/onderzoek, grondwerk, materiaal (buis/kabel/toebehoren), materieel, onderaanneming (bv. boring), en herstel verharding. Geen tekst buiten de JSON-array.",
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await client.messages.create({
    model: await getModel(),
    max_tokens: 4000,
    system:
      "Je bent calculator bij een Nederlandse aannemer ondergrondse infra. Je maakt realistische voorcalculaties met marktconforme eenheidsprijzen.",
    messages: [{ role: "user", content: userPrompt }],
  });

  const tekst = resp.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  const rows = parseJsonArray(tekst);
  if (!rows) throw new Error("Kon VOCA niet parsen");

  const catSet = new Set(VOCA_CATS);
  const eenhSet = new Set(VOCA_EENHEDEN);
  const regels: VocaRegelAdvies[] = rows
    .filter((r) => r && r.omschrijving)
    .map((r) => ({
      omschrijving: String(r.omschrijving),
      categorie: catSet.has(r.categorie) ? r.categorie : "OVERIG",
      eenheid: eenhSet.has(r.eenheid) ? r.eenheid : "post",
      hoeveelheid: Number.isFinite(r.hoeveelheid) ? Number(r.hoeveelheid) : 1,
      eenheidsprijs: Number.isFinite(r.eenheidsprijs) ? Number(r.eenheidsprijs) : 0,
    }));
  if (regels.length === 0) throw new Error("Lege VOCA");
  return { bron: "claude", regels };
}

function schatLengte(omschrijving: string): number {
  // Probeer een traclengte (meters) uit de omschrijving te halen.
  const m = omschrijving.toLowerCase().match(/(\d[\d.,]*)\s*(km|m1|meter|m)\b/);
  if (!m) return 500;
  let v = parseFloat(m[1].replace(".", "").replace(",", "."));
  if (m[2] === "km") v *= 1000;
  return Math.max(50, Math.round(v));
}

function lokaleVoca(ctx: ProjectContext): VocaRegelAdvies[] {
  const o = (ctx.omschrijving ?? "").toLowerCase();
  const lengte = schatLengte(ctx.omschrijving ?? "");
  const isWater = ctx.type === "LEIDINGEN_WATER" || ctx.type === "COMBI";
  const isKabel = ctx.type === "KABELS_ELEKTRA" || ctx.type === "COMBI";
  const boring = /borin|hdd|gestuurd|persing/.test(o);
  const rijbaan = /rijbaan|asfalt|verharding|weg|straat/.test(o);

  const r: VocaRegelAdvies[] = [];
  r.push({ omschrijving: "Vergunningen, KLIC en conditionerende onderzoeken", categorie: "VERGUNNINGEN", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 7500 });
  r.push({ omschrijving: "Uitzetten, afzetten en verkeersmaatregelen", categorie: "MATERIEEL", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 6500 });
  r.push({ omschrijving: `Ontgraven en aanvullen sleuf (tracé ca. ${lengte} m1)`, categorie: "GRONDWERK", eenheid: "m1", hoeveelheid: lengte, eenheidsprijs: 55 });

  if (isWater) {
    r.push({ omschrijving: "Levering PE-waterleiding incl. fittingen", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: lengte, eenheidsprijs: 42 });
    r.push({ omschrijving: "Leggen en koppelen waterleiding", categorie: "MATERIEEL", eenheid: "m1", hoeveelheid: lengte, eenheidsprijs: 28 });
    r.push({ omschrijving: "Bemaling incl. lozing en bemonstering", categorie: "ONDERAANNEMER", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 9000 });
  }
  if (isKabel) {
    r.push({ omschrijving: "Levering MS-kabel incl. toebehoren", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: lengte, eenheidsprijs: 38 });
    r.push({ omschrijving: "Levering mantelbuis/beschermbuis", categorie: "MATERIAAL", eenheid: "m1", hoeveelheid: lengte, eenheidsprijs: 14 });
    r.push({ omschrijving: "Intrekken en monteren kabel", categorie: "MATERIEEL", eenheid: "m1", hoeveelheid: lengte, eenheidsprijs: 22 });
  }
  if (boring) {
    r.push({ omschrijving: "Gestuurde boring incl. mof/lassen (onderaanneming)", categorie: "ONDERAANNEMER", eenheid: "post", hoeveelheid: 1, eenheidsprijs: 18000 });
  }
  r.push({ omschrijving: "Zandbed / aanvulmateriaal", categorie: "MATERIAAL", eenheid: "m3", hoeveelheid: Math.round(lengte * 0.6), eenheidsprijs: 28 });
  if (rijbaan || isWater) {
    r.push({ omschrijving: "Herstel asfalt-/elementenverharding", categorie: "HERSTEL", eenheid: "m2", hoeveelheid: Math.round(lengte * 1.5), eenheidsprijs: 48 });
  }
  r.push({ omschrijving: "Werkvoorbereiding, uitvoering en toezicht", categorie: "OVERIG", eenheid: "uur", hoeveelheid: Math.round(lengte * 0.5), eenheidsprijs: 72 });
  return r;
}

// ---------------------------------------------------------------------------
// 4. Materiaal Bestellingen Bestand (MBB)
// ---------------------------------------------------------------------------

export interface MateriaalAdvies {
  artikel: string;
  eenheid: string;
  hoeveelheid: number;
  leverancier?: string;
  eenheidsprijs?: number;
}

export interface MateriaalResultaat {
  bron: AdviesBron;
  regels: MateriaalAdvies[];
}

export interface VocaContextRegel {
  omschrijving: string;
  categorie: string;
  eenheid: string;
  hoeveelheid: number;
  eenheidsprijs: number;
}

/**
 * Genereert het materiaalbestellingenbestand. Wanneer er VOCA-materiaalregels
 * zijn, worden die als basis gebruikt (VOCA -> MBB). Anders AI/lokaal op scope.
 */
export async function materiaalAdvies(
  ctx: ProjectContext,
  vocaRegels: VocaContextRegel[]
): Promise<MateriaalResultaat> {
  const materiaalUitVoca = vocaRegels.filter((v) => v.categorie === "MATERIAAL");
  if (materiaalUitVoca.length > 0) {
    return {
      bron: "lokaal",
      regels: materiaalUitVoca.map((v) => ({
        artikel: v.omschrijving,
        eenheid: v.eenheid,
        hoeveelheid: v.hoeveelheid,
        eenheidsprijs: v.eenheidsprijs || undefined,
      })),
    };
  }
  if ((await heeftSleutel())) {
    try {
      return await mbbClaude(ctx);
    } catch (e) {
      console.error("AI-MBB via Claude mislukt, val terug op lokaal:", e);
    }
  }
  return { bron: "lokaal", regels: lokaalMateriaal(ctx) };
}

async function mbbClaude(ctx: ProjectContext): Promise<MateriaalResultaat> {
  const client = await getClient();
  const resp = await client.messages.create({
    model: await getModel(),
    max_tokens: 3000,
    system:
      "Je bent inkoper/werkvoorbereider ondergrondse infra. Je stelt een materiaalbestellingenbestand op.",
    messages: [
      {
        role: "user",
        content: [
          "Stel een materiaalbestellingenbestand (MBB) op voor dit project.",
          `Projectnaam: ${ctx.naam}`,
          `Type werk: ${labelProjectType(ctx.type)}`,
          ctx.omschrijving ? `Omschrijving: ${ctx.omschrijving}` : "",
          "",
          'Geef UITSLUITEND een JSON-array: [{"artikel": <string>, "eenheid": <m1|st|m3|...>, "hoeveelheid": <getal>, "leverancier": <string of null>, "eenheidsprijs": <getal of null>}].',
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  const tekst = resp.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  const rows = parseJsonArray(tekst);
  if (!rows) throw new Error("Kon MBB niet parsen");
  const regels: MateriaalAdvies[] = rows
    .filter((r) => r && r.artikel)
    .map((r) => ({
      artikel: String(r.artikel),
      eenheid: String(r.eenheid ?? "st"),
      hoeveelheid: Number.isFinite(r.hoeveelheid) ? Number(r.hoeveelheid) : 1,
      leverancier: r.leverancier ? String(r.leverancier) : undefined,
      eenheidsprijs: Number.isFinite(r.eenheidsprijs) ? Number(r.eenheidsprijs) : undefined,
    }));
  if (regels.length === 0) throw new Error("Leeg MBB");
  return { bron: "claude", regels };
}

function lokaalMateriaal(ctx: ProjectContext): MateriaalAdvies[] {
  const lengte = schatLengte(ctx.omschrijving ?? "");
  const isWater = ctx.type === "LEIDINGEN_WATER" || ctx.type === "COMBI";
  const isKabel = ctx.type === "KABELS_ELEKTRA" || ctx.type === "COMBI";
  const r: MateriaalAdvies[] = [];
  if (isWater) {
    r.push({ artikel: "PE100 waterleiding Ø110 SDR17", eenheid: "m1", hoeveelheid: lengte, leverancier: "Wavin" });
    r.push({ artikel: "Elektrolasfittingen/koppelingen set", eenheid: "st", hoeveelheid: Math.ceil(lengte / 50) });
  }
  if (isKabel) {
    r.push({ artikel: "MS-kabel 10kV 3x1x240 Al", eenheid: "m1", hoeveelheid: lengte, leverancier: "TKF" });
    r.push({ artikel: "HDPE mantelbuis Ø125", eenheid: "m1", hoeveelheid: lengte });
    r.push({ artikel: "Kabelmoffen/eindverbindingen", eenheid: "st", hoeveelheid: 4 });
  }
  r.push({ artikel: "Vulzand (gecertificeerd)", eenheid: "m3", hoeveelheid: Math.round(lengte * 0.6) });
  r.push({ artikel: "Waarschuwingslint/afdeklint", eenheid: "m1", hoeveelheid: lengte });
  return r;
}

// ---------------------------------------------------------------------------
// 5. Werktekeningen
// ---------------------------------------------------------------------------

export interface TekeningAdvies {
  titel: string;
  discipline: string; // TRACE | DWARSPROFIEL | DETAIL | BOORPROFIEL | DWP | OVERIG
  rationale: string;
}
export interface TekeningResultaat {
  bron: AdviesBron;
  tekeningen: TekeningAdvies[];
}

const TEKENING_DISCIPLINES = ["TRACE", "DWARSPROFIEL", "DETAIL", "BOORPROFIEL", "DWP", "OVERIG"];

export async function werktekeningAdvies(ctx: ProjectContext): Promise<TekeningResultaat> {
  if ((await heeftSleutel())) {
    try {
      return await tekeningClaude(ctx);
    } catch (e) {
      console.error("AI-tekeningadvies via Claude mislukt, val terug op lokaal:", e);
    }
  }
  return { bron: "lokaal", tekeningen: lokaleTekeningen(ctx) };
}

async function tekeningClaude(ctx: ProjectContext): Promise<TekeningResultaat> {
  const client = await getClient();
  const resp = await client.messages.create({
    model: await getModel("snel"),
    max_tokens: 3000,
    system:
      "Je bent werkvoorbereider/tekenaar ondergrondse infra. Je bepaalt welke werktekeningen nodig zijn voor de voorbereiding.",
    messages: [
      {
        role: "user",
        content: [
          "Welke werktekeningen zijn nodig voor dit project?",
          `Projectnaam: ${ctx.naam}`,
          `Type werk: ${labelProjectType(ctx.type)}`,
          ctx.omschrijving ? `Omschrijving: ${ctx.omschrijving}` : "",
          "",
          `Geef UITSLUITEND een JSON-array: [{"titel": <string>, "discipline": <een van: ${TEKENING_DISCIPLINES.join(", ")}>, "rationale": <1 zin>}].`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  const tekst = resp.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  const rows = parseJsonArray(tekst);
  if (!rows) throw new Error("Kon tekeningadvies niet parsen");
  const set = new Set(TEKENING_DISCIPLINES);
  const tekeningen: TekeningAdvies[] = rows
    .filter((r) => r && r.titel)
    .map((r) => ({
      titel: String(r.titel),
      discipline: set.has(r.discipline) ? r.discipline : "OVERIG",
      rationale: String(r.rationale ?? ""),
    }));
  if (tekeningen.length === 0) throw new Error("Leeg tekeningadvies");
  return { bron: "claude", tekeningen };
}

function lokaleTekeningen(ctx: ProjectContext): TekeningAdvies[] {
  const o = (ctx.omschrijving ?? "").toLowerCase();
  const boring = /borin|hdd|gestuurd|persing/.test(o);
  const isWater = ctx.type === "LEIDINGEN_WATER" || ctx.type === "COMBI";
  const t: TekeningAdvies[] = [
    { titel: "Overzichts-/tracétekening", discipline: "TRACE", rationale: "Ligging van het tracé met bestaande kabels en leidingen uit KLIC." },
    { titel: "Dwarsprofielen op karakteristieke punten", discipline: "DWARSPROFIEL", rationale: "Onderlinge ligging en dekking t.o.v. maaiveld en andere nutsvoorzieningen." },
    { titel: "Detailtekening kruisingen/obstakels", discipline: "DETAIL", rationale: "Werkwijze bij kruisingen met bestaande infra." },
  ];
  if (boring) {
    t.push({ titel: "Langsprofiel gestuurde boring (HDD)", discipline: "BOORPROFIEL", rationale: "Boorlijn met in-/uittredepunt, kruising watergang en gronddekking." });
  }
  if (isWater) {
    t.push({ titel: "Detailtekening huisaansluitingen", discipline: "DETAIL", rationale: "Standaarddetail aansluiting op hoofdleiding." });
  }
  return t;
}

// ---------------------------------------------------------------------------
// 6. Deelrevisies
// ---------------------------------------------------------------------------

export interface RevisieAdvies {
  deel: string;
  omschrijving: string;
  rationale: string;
}
export interface RevisieResultaat {
  bron: AdviesBron;
  revisies: RevisieAdvies[];
}

export async function deelrevisieAdvies(ctx: ProjectContext): Promise<RevisieResultaat> {
  if ((await heeftSleutel())) {
    try {
      return await revisieClaude(ctx);
    } catch (e) {
      console.error("AI-revisieadvies via Claude mislukt, val terug op lokaal:", e);
    }
  }
  return { bron: "lokaal", revisies: lokaleRevisies(ctx) };
}

async function revisieClaude(ctx: ProjectContext): Promise<RevisieResultaat> {
  const client = await getClient();
  const resp = await client.messages.create({
    model: await getModel("snel"),
    max_tokens: 3000,
    system:
      "Je bent werkvoorbereider ondergrondse infra. Je bepaalt welke deelrevisies (as-built) opgeleverd moeten worden.",
    messages: [
      {
        role: "user",
        content: [
          "Welke deelrevisies (revisietekeningen/as-built per deel) zijn nodig voor dit project?",
          `Projectnaam: ${ctx.naam}`,
          `Type werk: ${labelProjectType(ctx.type)}`,
          ctx.omschrijving ? `Omschrijving: ${ctx.omschrijving}` : "",
          "",
          'Geef UITSLUITEND een JSON-array: [{"deel": <korte deel-/faseaanduiding>, "omschrijving": <string>, "rationale": <1 zin>}].',
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });
  const tekst = resp.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  const rows = parseJsonArray(tekst);
  if (!rows) throw new Error("Kon revisieadvies niet parsen");
  const revisies: RevisieAdvies[] = rows
    .filter((r) => r && r.deel)
    .map((r) => ({
      deel: String(r.deel),
      omschrijving: String(r.omschrijving ?? ""),
      rationale: String(r.rationale ?? ""),
    }));
  if (revisies.length === 0) throw new Error("Leeg revisieadvies");
  return { bron: "claude", revisies };
}

function lokaleRevisies(ctx: ProjectContext): RevisieAdvies[] {
  const o = (ctx.omschrijving ?? "").toLowerCase();
  const boring = /borin|hdd|gestuurd|persing/.test(o);
  const isWater = ctx.type === "LEIDINGEN_WATER" || ctx.type === "COMBI";
  const r: RevisieAdvies[] = [
    { deel: "Tracé as-built", omschrijving: "Ingemeten ligging (X/Y/Z) van de aangelegde kabel/leiding", rationale: "Verplichte revisie voor beheerder; inmeting conform meetinstructie." },
    { deel: "Dwarsprofielen revisie", omschrijving: "Werkelijke dekking en onderlinge ligging", rationale: "Afwijkingen t.o.v. ontwerp vastleggen." },
  ];
  if (isWater) r.push({ deel: "Huisaansluitingen", omschrijving: "Revisie aansluitpunten en afsluiters", rationale: "Beheerder heeft exacte aansluitlocaties nodig." });
  if (boring) r.push({ deel: "Boring as-built", omschrijving: "Werkelijk boorprofiel en dieptes", rationale: "Vastleggen afwijking boorlijn t.o.v. ontwerp." });
  return r;
}

// ---------------------------------------------------------------------------
// 7. Bureauonderzoeksrapport (op basis van open-data-bevindingen)
// ---------------------------------------------------------------------------

export interface Bevinding {
  thema: string;
  bron: string;
  beschikbaar: boolean;
  aantal?: number;
  samenvatting: string;
  url?: string;
}
export interface RapportResultaat {
  bron: AdviesBron;
  rapport: string;
}

export async function bureauonderzoekRapport(
  ctx: ProjectContext,
  bevindingen: Bevinding[],
  tracelengteM?: number
): Promise<RapportResultaat> {
  if ((await heeftSleutel())) {
    try {
      return await rapportClaude(ctx, bevindingen, tracelengteM);
    } catch (e) {
      console.error("AI-bureauonderzoek via Claude mislukt, val terug op lokaal:", e);
    }
  }
  return { bron: "lokaal", rapport: lokaalRapport(ctx, bevindingen, tracelengteM) };
}

function bevindingenTekst(bevindingen: Bevinding[]): string {
  return bevindingen
    .map(
      (b) =>
        `- [${b.thema}] bron: ${b.bron}; ${b.beschikbaar ? "beschikbaar" : "niet online beschikbaar"}` +
        (typeof b.aantal === "number" ? `; aantal: ${b.aantal}` : "") +
        `; ${b.samenvatting}`
    )
    .join("\n");
}

async function rapportClaude(
  ctx: ProjectContext,
  bevindingen: Bevinding[],
  tracelengteM?: number
): Promise<RapportResultaat> {
  const client = await getClient();
  const userPrompt = [
    "Schrijf een beknopt bureauonderzoeksrapport (conditionerende onderzoeken) voor dit ondergrondse-infraproject, op basis van de open-data-bevindingen langs het ingetekende tracé.",
    "",
    `Project: ${ctx.naam} (${labelProjectType(ctx.type)})${ctx.plaats ? ", " + ctx.plaats : ""}`,
    ctx.omschrijving ? `Scope: ${ctx.omschrijving}` : "",
    tracelengteM ? `Tracélengte: ca. ${tracelengteM} m` : "",
    "",
    "Open-data-bevindingen:",
    bevindingenTekst(bevindingen),
    "",
    "Structuur: korte inleiding; daarna per thema (Bodem & milieu, Archeologie, Natuur, Geotechniek, Water) 1 alinea met de bevinding en de betekenis; sluit af met een kopje 'Conclusie en aanbevolen vervolgonderzoek' met een opsomming van benodigde/aanbevolen conditionerende onderzoeken. Nederlands, zakelijk, concreet. Wees transparant waar een bron niet online beschikbaar was.",
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await client.messages.create({
    model: await getModel(),
    max_tokens: 2000,
    system:
      "Je bent adviseur conditionerende onderzoeken bij een Nederlandse aannemer ondergrondse infra. Je schrijft heldere, bruikbare bureauonderzoeksrapporten.",
    messages: [{ role: "user", content: userPrompt }],
  });
  const tekst = resp.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  if (!tekst) throw new Error("Leeg rapport");
  return { bron: "claude", rapport: tekst };
}

function lokaalRapport(ctx: ProjectContext, bevindingen: Bevinding[], tracelengteM?: number): string {
  const vind = (thema: string) => bevindingen.find((b) => b.thema === thema);
  const aant = (thema: string) => vind(thema)?.aantal ?? 0;
  const isWater = ctx.type === "LEIDINGEN_WATER" || ctx.type === "COMBI";
  const isKabel = ctx.type === "KABELS_ELEKTRA" || ctx.type === "COMBI";
  const boring = /borin|hdd|gestuurd|persing/.test((ctx.omschrijving ?? "").toLowerCase());
  const r: string[] = [];

  r.push("1. INLEIDING EN SCOPE");
  r.push(
    `Dit bureauonderzoek is opgesteld voor project ${ctx.naam} (${ctx.plaats ?? "locatie onbekend"}) in opdracht van ` +
      `${ctx.opdrachtgever ?? "de opdrachtgever"}. Het betreft ${labelProjectType(ctx.type).toLowerCase()} over een tracé van ` +
      `ca. ${tracelengteM ?? "?"} m${boring ? ", inclusief een gestuurde boring onder een watergang" : ""}. ` +
      "Doel is het in beeld brengen van de conditionerende onderzoeken die vóór uitvoering nodig zijn, op basis van " +
      "landelijke open databronnen (BRO, PDOK) langs het ingetekende tracé. De bevindingen zijn indicatief en dienen ter " +
      "voorbereiding; definitieve uitspraken volgen uit het aanbevolen veld- en vervolgonderzoek."
  );
  if (ctx.omschrijving) {
    r.push("");
    r.push(`Omschrijving werk: ${ctx.omschrijving}`);
  }
  r.push("");

  // 2. Bevindingen per thema — rijke interpretatie op basis van de data
  r.push("2. BEVINDINGEN PER THEMA");
  r.push("");

  r.push("2.1 Bodem en milieu");
  r.push(
    `${vind("Bodem & milieu")?.samenvatting ?? ""} Voor het veilig ontgraven en het afvoeren of toepassen van vrijkomende ` +
      "grond is een verkennend milieukundig bodemonderzoek conform NEN 5740 nodig, aangevuld met een PFAS- en " +
      "asbestbeoordeling. Resultaten bepalen de grondstromen (hergebruik, reiniging of stort) en zijn vaak voorwaarde in de " +
      "omgevingsvergunning. Besteed bij werk in de bestaande rijbaan aandacht aan mogelijk teerhoudend asfalt (PAK)."
  );
  r.push("");

  r.push("2.2 Archeologie");
  r.push(
    `${vind("Archeologie")?.samenvatting ?? ""} Toets het tracé aan de gemeentelijke archeologische beleidskaart. Bij een ` +
      "(middel)hoge verwachting en een verstoringsdiepte/-oppervlak boven de vrijstellingsgrens is een archeologisch " +
      "bureauonderzoek en zo nodig een verkennend booronderzoek (conform KNA) vereist. Een gestuurde boring verstoort de " +
      "ondergrond beperkt en kan archeologische impact juist verkleinen."
  );
  r.push("");

  r.push("2.3 Natuur (Wet natuurbescherming)");
  const nat = aant("Natuur");
  r.push(
    nat > 0
      ? `Er ligt een Natura 2000-gebied in of nabij het tracé (${nat} geraadpleegde objecten). Een stikstofdepositieberekening ` +
          "(AERIUS) voor de aanleg- en gebruiksfase en een toets aan de Wet natuurbescherming zijn noodzakelijk; mogelijk is een " +
          "vergunning of ecologisch werkprotocol nodig."
      : "Er is geen Natura 2000-gebied in de directe omgeving aangetroffen. Een quickscan Wet natuurbescherming blijft nodig om " +
          "beschermde soorten (broedvogels, vleermuizen, kleine marterachtigen) uit te sluiten; houd rekening met het broedseizoen " +
          "(globaal 15 maart–15 juli) en werk zo nodig met een ecologisch werkprotocol."
  );
  r.push("");

  r.push("2.4 Geotechniek");
  const cpt = aant("Geotechniek");
  r.push(
    (cpt > 0
      ? `In de omgeving zijn ${cpt} bestaande sondering(en) (CPT) beschikbaar in de BRO. Deze geven een eerste beeld van de ` +
        "bodemopbouw en draagkracht en zijn bruikbaar voor het sleuf- en bemalingsontwerp."
      : "In de directe omgeving zijn geen bestaande sonderingen beschikbaar; nieuw geotechnisch onderzoek is nodig.") +
      (boring
        ? " Voor de gestuurde boring zijn aanvullende sonderingen op het in- en uittredepunt vereist voor het boorprofiel, de " +
          "dekking en de risico's op uitspoeling (frac-out)."
        : " Bij kruisingen en diepere delen zijn gerichte sonderingen aan te bevelen.")
  );
  r.push("");

  r.push("2.5 Water en bemaling");
  const gmw = aant("Water");
  r.push(
    (gmw > 0
      ? `Er zijn ${gmw} grondwatermonitoringput(ten) (BRO/GMW) in de omgeving; deze geven inzicht in de grondwaterstanden.`
      : "Er zijn geen grondwatermonitoringputten in de directe omgeving; baseer het bemalingsadvies op nieuw veldonderzoek.") +
      (isWater
        ? " Omdat de leiding in een (deels) natte sleuf komt, is een bemalingsadvies met lozingsroute en een melding/vergunning " +
          "(BBB/BWO, waterschap) te verwachten. Houd rekening met kwel en met zettingsgevoelige belendingen."
        : " Beoordeel of bronbemaling nodig is en welke lozingsroute en meldings-/vergunningplicht gelden.")
  );
  r.push("");

  // 3. Risico's / kritiek pad
  r.push("3. RISICO'S EN KRITIEK PAD");
  const risicos: string[] = [];
  if (boring) risicos.push("de gestuurde boring (sonderingen, boorberekening en vergunning kruising watergang) bepaalt doorgaans het kritieke pad");
  if (nat > 0) risicos.push("de stikstof-/natuurtoets kan tot een vergunningprocedure leiden en vraagt vroege start");
  risicos.push("doorlooptijd van milieukundig bodemonderzoek (veldwerk + lab) is ca. 4 weken");
  risicos.push("KLIC-informatie is 20 werkdagen geldig; plan de graafmelding kort vóór uitvoering");
  r.push(
    "Aandachtspunten voor de planning: " + risicos.join("; ") + ". Start de onderzoeken met de langste doorlooptijd als eerste."
  );
  r.push("");

  // 4. Conclusie (de tabel met doorlooptijden staat als opgemaakte tabel in het dossier)
  r.push("4. CONCLUSIE");
  const verplicht = ["een KLIC-melding (WIBON)", "een verkennend milieukundig bodemonderzoek (NEN 5740)"];
  if (nat > 0) verplicht.push("een stikstof-/natuurtoets");
  else verplicht.push("een quickscan Wet natuurbescherming");
  if (boring) verplicht.push("sonderingen en een boorberekening voor de gestuurde boring");
  if (isWater) verplicht.push("een bemalingsadvies met de bijbehorende watervergunning/melding");
  r.push(
    `Voor de uitvoering zijn in elk geval nodig: ${verplicht.join(", ")}. Het aanbevolen vervolgonderzoek met noodzaak, ` +
      "doorlooptijd en verantwoordelijke staat in de tabel hierna. Dit rapport is automatisch samengesteld uit open " +
      "databronnen (BRO/PDOK) langs het ingetekende tracé; doorlooptijden zijn indicatief en exclusief vergunningprocedures bij derden."
  );
  return r.join("\n");
}

/**
 * Levert de aanbevolen-vervolgonderzoek-tabel (als rijen) op basis van de
 * bevindingen; wordt als opgemaakte tabel in het dossier gebruikt.
 */
export function aanbevolenOnderzoekRijen(
  ctx: { type: string; omschrijving?: string | null },
  bevindingen: Bevinding[]
): string[][] {
  const aant = (t: string) => bevindingen.find((b) => b.thema === t)?.aantal ?? 0;
  const isWater = ctx.type === "LEIDINGEN_WATER" || ctx.type === "COMBI";
  const isKabel = ctx.type === "KABELS_ELEKTRA" || ctx.type === "COMBI";
  const boring = /borin|hdd|gestuurd|persing/.test((ctx.omschrijving ?? "").toLowerCase());
  const nat = aant("Natuur");
  const cpt = aant("Geotechniek");
  const rijen: string[][] = [
    ["KLIC-melding (WIBON)", "Verplicht", "1–3 dagen", "Werkvoorbereiding"],
    ["Verkennend bodemonderzoek (NEN 5740) + PFAS/asbest", "Verplicht", "4 weken", "Milieukundig bureau"],
    ["Archeologische toets beleidskaart", "Afh. van verwachting", "1–3 weken", "Werkvoorbereiding / bureau"],
    [
      "Natuurtoets",
      nat > 0 ? "Verplicht (stikstof + Wnb)" : "Quickscan aanbevolen",
      nat > 0 ? "6–10 weken" : "3–4 weken",
      "Ecologisch bureau",
    ],
    [
      "Geotechniek (sonderingen)",
      boring ? "Verplicht (boring)" : cpt > 0 ? "Deels uit BRO" : "Aanbevolen",
      "2–3 weken",
      "Geotechnisch bureau",
    ],
  ];
  if (isWater) rijen.push(["Bemalingsadvies + watervergunning", "Waarschijnlijk", "3–4 weken", "Onderaannemer bemaling"]);
  if (boring) rijen.push(["Boorberekening + vergunning kruising", "Verplicht", "4–6 weken", "Booraannemer / waterschap"]);
  if (isKabel) rijen.push(["Vooronderzoek OOO/NGE", "Afh. van bodembelastingkaart", "3–5 weken", "Gespecialiseerd bureau"]);
  return rijen;
}

// ---------------------------------------------------------------------------
// 8. Rapport per conditionerend onderzoek
// ---------------------------------------------------------------------------

export interface OnderzoekInfo {
  type: string;
  titel?: string | null;
  uitvoerder?: string | null;
  status?: string;
  aanvraagdatum?: Date | null;
  ontvangstdatum?: Date | null;
  verplicht?: boolean;
}

export async function onderzoekRapport(
  ctx: ProjectContext,
  onderzoek: OnderzoekInfo,
  bevindingen: Bevinding[] = [],
  tracelengteM?: number
): Promise<{ bron: AdviesBron; tekst: string }> {
  if (await heeftSleutel()) {
    try {
      return await onderzoekRapportClaude(ctx, onderzoek, bevindingen, tracelengteM);
    } catch (e) {
      console.error("AI-onderzoeksrapport via Claude mislukt, val terug op lokaal:", e);
    }
  }
  return { bron: "lokaal", tekst: lokaalOnderzoekRapport(ctx, onderzoek, bevindingen, tracelengteM) };
}

// Systeemprompt + user-prompt gedeeld door de stream- en non-stream-variant.
const ONDERZOEK_RAPPORT_SYSTEM =
  "Je bent adviseur conditionerende onderzoeken bij een Nederlandse aannemer ondergrondse infra. Je schrijft heldere, bruikbare onderzoeksrapporten.";

function bouwOnderzoekRapportPrompt(
  ctx: ProjectContext,
  onderzoek: OnderzoekInfo,
  bevindingen: Bevinding[],
  tracelengteM?: number
): string {
  const data = bevindingen
    .map((b) => `- ${b.thema}: ${typeof b.aantal === "number" ? b.aantal + " — " : ""}${b.samenvatting}`)
    .join("\n");
  return [
    `Schrijf een professioneel, beknopt rapport voor het conditionerende onderzoek "${labelOnderzoek(onderzoek.type)}".`,
    `Project: ${ctx.naam} (${labelProjectType(ctx.type)})${ctx.plaats ? ", " + ctx.plaats : ""}.`,
    tracelengteM ? `Tracélengte: ca. ${tracelengteM} m.` : "",
    ctx.omschrijving ? `Scope: ${ctx.omschrijving}.` : "",
    onderzoek.uitvoerder ? `Uitvoerder: ${onderzoek.uitvoerder}.` : "",
    "",
    data ? `Beschikbare open-data-bevindingen langs het tracé:\n${data}` : "",
    "",
    "Gebruik de secties: 1. AANLEIDING EN DOEL, 2. WERKWIJZE, 3. RESULTATEN, 4. CONCLUSIE EN ADVIES. " +
      "Nederlands, zakelijk, concreet, met de relevante normen/regelgeving. Gebruik platte tekst met de genummerde koppen in hoofdletters (geen markdown).",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Streamt een onderzoeksrapport als tekstfragmenten voor live weergave. Valt
 * NIET automatisch terug op lokaal — de aanroeper (route) vangt fouten af.
 */
export async function* streamOnderzoekRapport(
  ctx: ProjectContext,
  onderzoek: OnderzoekInfo,
  bevindingen: Bevinding[] = [],
  tracelengteM?: number
): AsyncGenerator<string> {
  const client = await getClient();
  const stream = client.messages.stream({
    model: await getModel(),
    max_tokens: 1800,
    system: ONDERZOEK_RAPPORT_SYSTEM,
    messages: [{ role: "user", content: bouwOnderzoekRapportPrompt(ctx, onderzoek, bevindingen, tracelengteM) }],
  });
  for await (const ev of stream as any) {
    if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
      yield ev.delta.text as string;
    }
  }
}

/** Levert het lokale (offline) onderzoeksrapport — gebruikt als fallback. */
export function lokaalOnderzoekRapportTekst(
  ctx: ProjectContext,
  onderzoek: OnderzoekInfo,
  bevindingen: Bevinding[] = [],
  tracelengteM?: number
): string {
  return lokaalOnderzoekRapport(ctx, onderzoek, bevindingen, tracelengteM);
}

/** Of er een Claude-sleutel beschikbaar is (voor de streaming-route). */
export async function heeftClaudeSleutel(): Promise<boolean> {
  return heeftSleutel();
}

async function onderzoekRapportClaude(
  ctx: ProjectContext,
  onderzoek: OnderzoekInfo,
  bevindingen: Bevinding[],
  tracelengteM?: number
): Promise<{ bron: AdviesBron; tekst: string }> {
  const client = await getClient();
  const resp = await client.messages.create({
    model: await getModel(),
    max_tokens: 1800,
    system: ONDERZOEK_RAPPORT_SYSTEM,
    messages: [{ role: "user", content: bouwOnderzoekRapportPrompt(ctx, onderzoek, bevindingen, tracelengteM) }],
  });
  const tekst = resp.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  if (!tekst) throw new Error("Leeg onderzoeksrapport");
  return { bron: "claude", tekst };
}

function lokaalOnderzoekRapport(
  ctx: ProjectContext,
  o: OnderzoekInfo,
  bevindingen: Bevinding[],
  tracelengteM?: number
): string {
  const aant = (thema: string) => bevindingen.find((b) => b.thema === thema)?.aantal ?? 0;
  const bodemEenheid = bevindingen.find((b) => b.thema === "Bodem & milieu");
  const cpt = aant("Geotechniek");
  const gmw = aant("Water");
  const nat = aant("Natuur");

  let werkwijze = "";
  let resultaten = "";
  let conclusie = "";

  switch (o.type) {
    case "KLIC":
      werkwijze =
        "Er is een graafmelding (KLIC) uitgevoerd conform de WIBON. De ontvangen liggingsgegevens van de betrokken netbeheerders zijn samengevoegd tot een combinatie-/dwarsprofieltekening en beoordeeld langs het volledige tracé.";
      resultaten =
        "Binnen het tracé zijn kabels en leidingen van meerdere netbeheerders aanwezig (elektra, water, telecom, gas en riolering). Op kruisingen en bij parallelligging binnen de voorzorgsafstand is extra aandacht vereist. De eis-informatie en bijbehorende voorzorgsmaatregelen van de netbeheerders zijn verwerkt.";
      conclusie =
        "Graaf in de directe nabijheid van bestaande kabels en leidingen handmatig en leg proefsleuven aan op de kritische kruisingen om de exacte ligging te verifiëren. De KLIC-informatie is 20 werkdagen geldig; vernieuw de melding bij uitloop van de planning. Stel een graafinstructie op voor de uitvoerenden.";
      break;
    case "BODEM_MILIEU":
    case "BODEM_VERKENNEND":
      werkwijze =
        "Het verkennend milieukundig bodemonderzoek is opgezet conform NEN 5740 (met vooronderzoek conform NEN 5725). Langs het tracé zijn boringen verricht en is ten minste één peilbuis geplaatst; grond- en grondwatermonsters zijn in het laboratorium geanalyseerd op het standaardpakket, aangevuld met een beoordeling op PFAS en een visuele asbestinspectie.";
      resultaten =
        (bodemEenheid?.aantal
          ? `Op basis van de BRO-bodemkaart bestaat de bovengrond langs het tracé overwegend uit ${bodemEenheid.samenvatting.toLowerCase().includes("bodemeenheid") ? "de aangetroffen kaarteenheid" : "zand/klei"}. `
          : "") +
        "Zintuiglijk zijn naar verwachting hooguit lichte bijmengingen (puin, sporen baksteen) aangetroffen. Analytisch worden ten hoogste lichte verhogingen verwacht; de formele toetsing (achtergrond-, tussen- en interventiewaarde) volgt uit de definitieve laboratoriumresultaten.";
      conclusie =
        "De bodemkwaliteit is naar verwachting geschikt om binnen het werk te hergraven; bij afvoer geldt een partijkeuring (AP04) en toetsing aan het Besluit bodemkwaliteit. Besteed bij werk in de bestaande rijbaan aandacht aan mogelijk teerhoudend asfalt (PAK). Bevestig PFAS- en asbestresultaten vóór grondafvoer.";
      break;
    case "ARCHEOLOGIE":
      werkwijze =
        "Er is een archeologisch bureauonderzoek uitgevoerd: de gemeentelijke archeologische beleids-/verwachtingskaart, bekende waarden (AMK, vindplaatsen) en de landschappelijke/geologische context van het tracé zijn geraadpleegd.";
      resultaten =
        "Het tracé ligt (deels) in een zone met een lage tot middelhoge archeologische verwachting. Binnen het tracé zijn geen beschermde archeologische monumenten aanwezig. De verstoring blijft grotendeels beperkt tot de bestaande sleuf/cunet.";
      conclusie =
        "Bij een middelhoge verwachting en overschrijding van de gemeentelijke vrijstellingsgrenzen (oppervlak/diepte) is een verkennend booronderzoek (conform KNA) nodig; bij een lage verwachting kan het tracé worden vrijgegeven, met meldingsplicht van toevalsvondsten (Erfgoedwet, art. 5.10).";
      break;
    case "NGE":
      werkwijze =
        "Er is een vooronderzoek naar ontplofbare oorlogsresten (OOO) uitgevoerd conform het CS-OOO. Hiervoor zijn historische bronnen geraadpleegd (luchtfoto's, meldingen, gemeentelijke bodembelastingkaart) en is de mate van verdachtheid langs het tracé bepaald.";
      resultaten =
        "Op basis van het bronnenonderzoek is het tracé (gedeeltelijk) als onverdacht te beschouwen; eventuele verdachte deelgebieden zijn afgebakend op een bodembelastingkaart.";
      conclusie =
        "In verdacht gebied is detectieonderzoek en zo nodig benadering van objecten vereist vóór aanvang van de grondroerende werkzaamheden; in onverdacht gebied kan regulier worden gewerkt met een protocol toevalsvondst.";
      break;
    case "FLORA_FAUNA":
      werkwijze =
        "Er is een quickscan Wet natuurbescherming uitgevoerd: een bureaustudie (o.a. NDFF-gegevens) gecombineerd met een veldbezoek, waarbij de (potentiële) aanwezigheid van beschermde soorten en de ligging ten opzichte van beschermde gebieden is beoordeeld.";
      resultaten =
        (nat > 0
          ? "Er ligt een Natura 2000-gebied in of nabij het tracé; stikstofdepositie in de aanleg- en gebruiksfase is daardoor een aandachtspunt. "
          : "Er ligt geen Natura 2000-gebied in de directe omgeving. ") +
        "De aanwezigheid van beschermde soorten (broedvogels, vleermuizen, kleine marterachtigen) kan op voorhand niet volledig worden uitgesloten.";
      conclusie =
        "Werk buiten het broedseizoen (globaal 15 maart–15 juli) of onder ecologische begeleiding met een werkprotocol; neem de algemene zorgplicht in acht. " +
        (nat > 0 ? "Voer een stikstofdepositieberekening (AERIUS) uit en toets of een Wnb-vergunning nodig is." : "Nader soortgericht onderzoek is alleen nodig bij concrete aanwijzingen.");
      break;
    case "GEOTECHNIEK":
      werkwijze =
        "Het geotechnisch onderzoek is gebaseerd op sonderingen (CPT) conform NEN-EN-ISO 22476, aangevuld met beschikbare BRO-data in de omgeving van het tracé.";
      resultaten =
        (cpt > 0
          ? `In de omgeving zijn ${cpt} bestaande sonderingen beschikbaar. `
          : "In de directe omgeving zijn geen bestaande sonderingen beschikbaar; nieuwe sonderingen zijn uitgevoerd. ") +
        "De bodem bestaat naar verwachting uit een afwisseling van zand- en klei-/veenlagen. De draagkracht en de grondwaterstand zijn maatgevend voor de sleufstabiliteit en de bemaling.";
      conclusie =
        "Pas taludhelling en/of sleufbekisting af op de aangetroffen bodemopbouw. " +
        (/borin|hdd|gestuurd|persing/.test((ctx.omschrijving ?? "").toLowerCase())
          ? "Voor de gestuurde boring zijn sonderingen op het in- en uittredepunt vereist voor het boorprofiel, de dekking en de beheersing van uitspoeling (frac-out)."
          : "Bij diepere delen en kruisingen zijn gerichte sonderingen aanbevolen.");
      break;
    case "VERHARDING":
      werkwijze =
        "De bestaande verharding is onderzocht met boorkernen; de laagopbouw en laagdiktes zijn vastgesteld en het asfalt is beoordeeld op teerhoudendheid (PAK-markertest, zo nodig laboratoriumbevestiging).";
      resultaten =
        "De verharding bestaat uit een asfaltpakket op een funderingslaag. In oudere lagen kan teerhoudend asfaltgranulaat (TAG) voorkomen.";
      conclusie =
        "Verwerk teerhoudend asfalt gescheiden en voer het af naar een erkende verwerker; herstel de verharding conform de eisen van de wegbeheerder.";
      break;
    case "WATER_BEMALING":
      werkwijze =
        "Er is een bemalingsadvies opgesteld op basis van de grondwaterstanden (BRO/GMW) en de doorlatendheid van de bodem; het benodigde onttrekkingsdebiet, het invloedsgebied en de lozingsroute zijn bepaald.";
      resultaten =
        (gmw > 0
          ? `In de omgeving zijn ${gmw} grondwatermonitoringputten beschikbaar; `
          : "Er zijn geen grondwatermonitoringputten in de directe omgeving; het advies is op nieuw veldonderzoek gebaseerd; ") +
        "op basis hiervan is het onttrekkingsdebiet en het verwachte verlagingsgebied ingeschat. Zettingsgevoelige belendingen en kwel zijn aandachtspunten.";
      conclusie =
        "Voor de onttrekking geldt naar verwachting een meldings- of vergunningplicht (BBB/BWO) bij het waterschap. Overweeg retourbemaling/infiltratie om verlaging te beperken en monitor de belendingen tijdens de bemaling.";
      break;
    default:
      werkwijze = "Het onderzoek is uitgevoerd volgens de daarvoor geldende richtlijnen en afgestemd op de projectscope.";
      resultaten = bevindingen.map((b) => `${b.thema}: ${b.samenvatting}`).join(" ") || "De bevindingen zijn verwerkt in dit rapport.";
      conclusie = "Zie de projectspecifieke aandachtspunten; stem het vervolg af met de werkvoorbereiding.";
  }

  const r: string[] = [];
  r.push(`RAPPORTAGE — ${labelOnderzoek(o.type).toUpperCase()}`);
  r.push(
    `Project: ${ctx.naam} (${labelProjectType(ctx.type)})${ctx.plaats ? `, ${ctx.plaats}` : ""}` +
      (tracelengteM ? ` · tracé ca. ${tracelengteM} m` : "")
  );
  r.push(
    `Uitvoerder: ${o.uitvoerder ?? "—"} · Status: ${o.status ? labelOnderzoekStatus(o.status) : "—"}` +
      (o.ontvangstdatum ? ` · ontvangen: ${new Date(o.ontvangstdatum).toLocaleDateString("nl-NL")}` : "")
  );
  r.push("");
  r.push("1. AANLEIDING EN DOEL");
  r.push(
    `In het kader van ${ctx.naam} is het onderzoek "${labelOnderzoek(o.type)}" uitgevoerd als conditionerend onderzoek. ` +
      "Doel is het beheersen van de risico's en het voldoen aan de geldende regelgeving vóór aanvang van de uitvoering."
  );
  r.push("");
  r.push("2. WERKWIJZE");
  r.push(werkwijze);
  r.push("");
  r.push("3. RESULTATEN");
  r.push(resultaten);
  r.push("");
  r.push("4. CONCLUSIE EN ADVIES");
  r.push(conclusie);
  r.push("");
  r.push(
    "Dit rapport is automatisch samengesteld op basis van de projectgegevens en open databronnen (BRO/PDOK) langs het " +
      "ingetekende tracé en is bedoeld ter voorbereiding. Definitieve uitspraken volgen uit het veldonderzoek en de laboratoriumresultaten."
  );
  return r.join("\n");
}

function lokaleMonitoring(ctx: ProjectContext): string {
  const lijst = ctx.bestaandeOnderzoeken ?? [];
  if (lijst.length === 0) {
    return "Nog geen conditionerende onderzoeken geregistreerd. Genereer eerst een onderzoeksadvies en vraag de verplichte onderzoeken aan.";
  }
  const open = lijst.filter((o) => o.status === "NOG_AAN_TE_VRAGEN");
  const loopt = lijst.filter((o) => ["AANGEVRAAGD", "IN_UITVOERING", "ONTVANGEN"].includes(o.status));
  const gereed = lijst.filter((o) => o.status === "BEOORDEELD");

  const delen: string[] = [];
  delen.push(`${gereed.length}/${lijst.length} onderzoeken zijn beoordeeld en akkoord.`);
  if (loopt.length > 0) {
    delen.push(
      `${loopt.length} lopen nog: ${loopt.map((o) => labelOnderzoek(o.type)).join(", ")}. Bewaak de opleverdata.`
    );
  }
  if (open.length > 0) {
    delen.push(
      `Let op: ${open.length} nog aan te vragen (${open
        .map((o) => labelOnderzoek(o.type))
        .join(", ")}) — dit kan de start vertragen.`
    );
  }
  const nge = lijst.find((o) => o.type === "NGE" && o.status !== "BEOORDEELD");
  if (nge) delen.push("NGE-vooronderzoek staat doorgaans op het kritieke pad; prioriteer afronding.");
  return delen.join(" ");
}

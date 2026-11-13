// Repliceert de VOCA-AI-call van ai.ts voor HNB-2026-013 met een ruimere
// timeout (120s i.p.v. de 45s in de lib), zodat ook dit zwaardere project een
// echte Claude-voorcalculatie krijgt. Zelfde model/prompt als de app.
import { readFileSync } from "fs";
const envLine = readFileSync(".env", "utf8").split("\n").find((l) => !l.trim().startsWith("#") && l.includes("ANTHROPIC_API_KEY="));
const key = envLine ? envLine.split("=").slice(1).join("=").replace(/^"|"$/g, "").trim() : undefined;

const { prisma } = await import("../src/lib/db");
const { labelProjectType } = await import("../src/lib/domein");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const VOCA_CATS = ["VERGUNNINGEN", "GRONDWERK", "MATERIAAL", "MATERIEEL", "ONDERAANNEMER", "HERSTEL", "OVERIG"];
const VOCA_EENHEDEN = ["m1", "m2", "m3", "st", "uur", "post"];

const p = await prisma.project.findUniqueOrThrow({ where: { projectnummer: "HNB-2026-013" } });
const client = new Anthropic({ apiKey: key, timeout: 120_000, maxRetries: 1 });

const userPrompt = [
  "Stel een voorcalculatie (begroting) op voor dit project ondergrondse infra.",
  `Projectnaam: ${p.naam}`,
  `Type werk: ${labelProjectType(p.type)}`,
  p.plaats ? `Locatie: ${p.plaats}` : null,
  p.omschrijving ? `Omschrijving: ${p.omschrijving}` : null,
  "",
  `Geef UITSLUITEND een JSON-array. Elk element: {"omschrijving": <string>, "categorie": <een van: ${VOCA_CATS.join(", ")}>, "eenheid": <een van: ${VOCA_EENHEDEN.join(", ")}>, "hoeveelheid": <getal>, "eenheidsprijs": <euro per eenheid, getal>}.`,
  "Gebruik realistische Nederlandse richtprijzen. Dek vergunningen/onderzoek, grondwerk, materiaal (buis/kabel/toebehoren), materieel, onderaanneming (bv. boring), en herstel verharding. Geen tekst buiten de JSON-array.",
].filter(Boolean).join("\n");

const resp = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 6000,
  system: "Je bent calculator bij een Nederlandse aannemer ondergrondse infra. Je maakt realistische voorcalculaties met marktconforme eenheidsprijzen.",
  messages: [{ role: "user", content: userPrompt }],
});

const tekst = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
const schoon = tekst.replace(/```json/gi, "```").replace(/```/g, "").trim();
// Robuust tegen afgekapte JSON: verzamel losse, complete {…}-objecten.
const arr = [];
for (const m of schoon.matchAll(/\{[^{}]*\}/g)) {
  try { arr.push(JSON.parse(m[0])); } catch { /* onvolledig object overslaan */ }
}
if (arr.length === 0) throw new Error("Geen VOCA-objecten geparsed");

const catSet = new Set(VOCA_CATS), eenhSet = new Set(VOCA_EENHEDEN);
const regels = arr.filter((r) => r && r.omschrijving).map((r) => ({
  omschrijving: String(r.omschrijving),
  categorie: catSet.has(r.categorie) ? r.categorie : "OVERIG",
  eenheid: eenhSet.has(r.eenheid) ? r.eenheid : "post",
  hoeveelheid: Number.isFinite(r.hoeveelheid) ? Number(r.hoeveelheid) : 1,
  eenheidsprijs: Number.isFinite(r.eenheidsprijs) ? Number(r.eenheidsprijs) : 0,
}));

await prisma.vocaRegel.deleteMany({ where: { projectId: p.id } });
await prisma.vocaRegel.createMany({ data: regels.map((r) => ({ projectId: p.id, ...r, aiGegenereerd: true })) });

// Materiaal (MBB) uit de MATERIAAL-regels van de VOCA, zoals de app doet.
await prisma.materiaalRegel.deleteMany({ where: { projectId: p.id, bron: { in: ["VOCA", "AI"] } } });
await prisma.materiaalRegel.createMany({
  data: regels.filter((r) => r.categorie === "MATERIAAL").map((r) => ({
    projectId: p.id, artikel: r.omschrijving, eenheid: r.eenheid, hoeveelheid: r.hoeveelheid, eenheidsprijs: r.eenheidsprijs, status: "TE_BESTELLEN", bron: "VOCA",
  })),
});

const tot = regels.reduce((s, r) => s + r.hoeveelheid * r.eenheidsprijs, 0);
await prisma.activiteit.create({ data: { projectId: p.id, type: "AI", bericht: `Voorcalculatie (Claude): ${regels.length} regels, raming € ${Math.round(tot).toLocaleString("nl-NL")}.` } });
console.log(`claude VOCA: ${regels.length} regels, raming € ${Math.round(tot).toLocaleString("nl-NL")}; usage in/out ${resp.usage.input_tokens}/${resp.usage.output_tokens}`);
await prisma.$disconnect();

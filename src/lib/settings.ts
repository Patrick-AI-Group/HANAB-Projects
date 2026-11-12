// Applicatie-instellingen (key/value in DB). Server-only.
import { prisma } from "./db";

// Sonnet 5 i.p.v. Opus: aanzienlijk sneller voor deze gestructureerde taken,
// zodat AI-acties ruim binnen de serverless-timeout blijven.
export const STANDAARD_MODEL = "claude-sonnet-5";
// Haiku voor de simpele/korte acties (monitoring, tekening- en revisieadvies):
// nog sneller en goedkoper, kwaliteit ruim voldoende voor standaardlijstjes.
export const SNEL_MODEL = "claude-haiku-4-5";

export async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Anthropic API-sleutel: eerst uit instellingen, anders uit de omgeving. */
export async function getApiKey(): Promise<string | null> {
  const db = await getSetting("ANTHROPIC_API_KEY");
  if (db && db.trim()) return db.trim();
  const env = process.env.ANTHROPIC_API_KEY;
  return env && env.trim() ? env.trim() : null;
}

export async function heeftApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

export async function getModel(tier: "standaard" | "snel" = "standaard"): Promise<string> {
  // Een handmatig ingesteld model (instellingen) geldt overal en wint altijd.
  const m = await getSetting("ANTHROPIC_MODEL");
  if (m && m.trim()) return m.trim();
  return tier === "snel" ? SNEL_MODEL : STANDAARD_MODEL;
}

/** Waar de sleutel vandaan komt, voor weergave in de UI. */
export async function apiKeyBron(): Promise<"instellingen" | "omgeving" | "geen"> {
  const db = await getSetting("ANTHROPIC_API_KEY");
  if (db && db.trim()) return "instellingen";
  const env = process.env.ANTHROPIC_API_KEY;
  return env && env.trim() ? "omgeving" : "geen";
}

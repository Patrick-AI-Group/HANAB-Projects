// Applicatie-instellingen (key/value in DB). Server-only.
import { prisma } from "./db";

export const STANDAARD_MODEL = "claude-opus-4-8";

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

export async function getModel(): Promise<string> {
  const m = await getSetting("ANTHROPIC_MODEL");
  return m && m.trim() ? m.trim() : STANDAARD_MODEL;
}

/** Waar de sleutel vandaan komt, voor weergave in de UI. */
export async function apiKeyBron(): Promise<"instellingen" | "omgeving" | "geen"> {
  const db = await getSetting("ANTHROPIC_API_KEY");
  if (db && db.trim()) return "instellingen";
  const env = process.env.ANTHROPIC_API_KEY;
  return env && env.trim() ? "omgeving" : "geen";
}

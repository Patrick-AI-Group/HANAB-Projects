// Centrale domeindefinities voor HANAB BMS — ondergrondse infra.
// Eén bron van waarheid voor enum-waarden en hun Nederlandse labels.

export const PROJECT_TYPES = {
  KABELS_ELEKTRA: "Kabels elektra",
  LEIDINGEN_WATER: "Leidingen water",
  COMBI: "Combi (kabels + leidingen)",
} as const;
export type ProjectType = keyof typeof PROJECT_TYPES;

export const PROJECT_STATUS = {
  INTAKE: "Intake",
  VOORBEREIDING: "Voorbereiding",
  UITVOERING: "Uitvoering",
  REVISIE: "Revisie",
  AFGEROND: "Afgerond",
} as const;
export type ProjectStatus = keyof typeof PROJECT_STATUS;

export const PROJECT_STATUS_VOLGORDE: ProjectStatus[] = [
  "INTAKE",
  "VOORBEREIDING",
  "UITVOERING",
  "REVISIE",
  "AFGEROND",
];

// Conditionerende onderzoeken (ondergrondse infra)
export const ONDERZOEK_TYPES = {
  KLIC: "KLIC-melding (kabels & leidingen)",
  BODEM_MILIEU: "Milieukundig bodemonderzoek (NEN 5740)",
  BODEM_VERKENNEND: "Verkennend bodemonderzoek",
  ARCHEOLOGIE: "Archeologisch onderzoek",
  NGE: "Ontplofbare oorlogsresten (OOO/NGE)",
  FLORA_FAUNA: "Flora & fauna / Wet natuurbescherming",
  GEOTECHNIEK: "Geotechniek / sonderingen",
  VERHARDING: "Verhardingsonderzoek",
  WATER_BEMALING: "Water & bemaling (BWO/BBB)",
  OVERIG: "Overig onderzoek",
} as const;
export type OnderzoekType = keyof typeof ONDERZOEK_TYPES;

export const ONDERZOEK_STATUS = {
  NOG_AAN_TE_VRAGEN: "Nog aan te vragen",
  AANGEVRAAGD: "Aangevraagd",
  IN_UITVOERING: "In uitvoering",
  ONTVANGEN: "Ontvangen",
  BEOORDEELD: "Beoordeeld / akkoord",
  AFGEKEURD: "Afgekeurd",
} as const;
export type OnderzoekStatus = keyof typeof ONDERZOEK_STATUS;

// Kleurklassen (Tailwind) per onderzoekstatus — voor badges.
export const ONDERZOEK_STATUS_KLEUR: Record<OnderzoekStatus, string> = {
  NOG_AAN_TE_VRAGEN: "bg-slate-100 text-slate-700 ring-slate-200",
  AANGEVRAAGD: "bg-amber-100 text-amber-800 ring-amber-200",
  IN_UITVOERING: "bg-blue-100 text-blue-800 ring-blue-200",
  ONTVANGEN: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  BEOORDEELD: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  AFGEKEURD: "bg-rose-100 text-rose-800 ring-rose-200",
};

export const PROJECT_STATUS_KLEUR: Record<ProjectStatus, string> = {
  INTAKE: "bg-slate-100 text-slate-700 ring-slate-200",
  VOORBEREIDING: "bg-amber-100 text-amber-800 ring-amber-200",
  UITVOERING: "bg-blue-100 text-blue-800 ring-blue-200",
  REVISIE: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  AFGEROND: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export function labelOnderzoek(type: string): string {
  return (ONDERZOEK_TYPES as Record<string, string>)[type] ?? type;
}
export function labelOnderzoekStatus(status: string): string {
  return (ONDERZOEK_STATUS as Record<string, string>)[status] ?? status;
}
export function labelProjectType(type: string): string {
  return (PROJECT_TYPES as Record<string, string>)[type] ?? type;
}
export function labelProjectStatus(status: string): string {
  return (PROJECT_STATUS as Record<string, string>)[status] ?? status;
}

// --- Voorcalculatie (VOCA) ---
export const VOCA_CATEGORIE = {
  VERGUNNINGEN: "Vergunningen & onderzoek",
  GRONDWERK: "Grondwerk",
  MATERIAAL: "Materiaal",
  MATERIEEL: "Materieel",
  ONDERAANNEMER: "Onderaanneming",
  HERSTEL: "Herstel verharding",
  OVERIG: "Overig",
} as const;
export type VocaCategorie = keyof typeof VOCA_CATEGORIE;

export const EENHEDEN = ["m1", "m2", "m3", "st", "uur", "post"] as const;

export function labelVocaCategorie(c: string): string {
  return (VOCA_CATEGORIE as Record<string, string>)[c] ?? c;
}

// --- Materiaal Bestellingen Bestand (MBB) ---
export const MBB_STATUS = {
  TE_BESTELLEN: "Te bestellen",
  BESTELD: "Besteld",
  GELEVERD: "Geleverd",
} as const;
export type MbbStatus = keyof typeof MBB_STATUS;

export const MBB_STATUS_KLEUR: Record<MbbStatus, string> = {
  TE_BESTELLEN: "bg-slate-100 text-slate-700 ring-slate-200",
  BESTELD: "bg-amber-100 text-amber-800 ring-amber-200",
  GELEVERD: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export function labelMbbStatus(s: string): string {
  return (MBB_STATUS as Record<string, string>)[s] ?? s;
}

export function euro(n: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

// --- Werktekeningen ---
export const TEKENING_DISCIPLINE = {
  TRACE: "Tracétekening",
  DWARSPROFIEL: "Dwarsprofiel",
  DETAIL: "Detailtekening",
  BOORPROFIEL: "Boorprofiel",
  DWP: "Dwarsdoorsnede/DWP",
  OVERIG: "Overig",
} as const;
export type TekeningDiscipline = keyof typeof TEKENING_DISCIPLINE;

export const TEKENING_STATUS = {
  CONCEPT: "Concept",
  IN_REVIEW: "In review",
  GOEDGEKEURD: "Goedgekeurd",
  DEFINITIEF: "Definitief",
  VERVALLEN: "Vervallen",
} as const;
export type TekeningStatus = keyof typeof TEKENING_STATUS;

export const TEKENING_STATUS_KLEUR: Record<TekeningStatus, string> = {
  CONCEPT: "bg-slate-100 text-slate-700 ring-slate-200",
  IN_REVIEW: "bg-amber-100 text-amber-800 ring-amber-200",
  GOEDGEKEURD: "bg-blue-100 text-blue-800 ring-blue-200",
  DEFINITIEF: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  VERVALLEN: "bg-rose-100 text-rose-700 ring-rose-200",
};

export function labelTekeningDiscipline(d: string): string {
  return (TEKENING_DISCIPLINE as Record<string, string>)[d] ?? d;
}
export function labelTekeningStatus(s: string): string {
  return (TEKENING_STATUS as Record<string, string>)[s] ?? s;
}

// --- Weekproducties ---
export const WEEKPRODUCTIE_STATUS = {
  CONCEPT: "Concept",
  INGEDIEND: "Ingediend",
  GOEDGEKEURD: "Goedgekeurd",
} as const;
export function labelWeekproductieStatus(s: string): string {
  return (WEEKPRODUCTIE_STATUS as Record<string, string>)[s] ?? s;
}

// --- Deelbetalingen (termijnen) ---
export const DEELBETALING_STATUS = {
  CONCEPT: "Concept",
  INGEDIEND: "Ingediend",
  GOEDGEKEURD: "Goedgekeurd",
  BETAALD: "Betaald",
} as const;
export type DeelbetalingStatus = keyof typeof DEELBETALING_STATUS;

export const DEELBETALING_STATUS_KLEUR: Record<DeelbetalingStatus, string> = {
  CONCEPT: "bg-slate-100 text-slate-700 ring-slate-200",
  INGEDIEND: "bg-amber-100 text-amber-800 ring-amber-200",
  GOEDGEKEURD: "bg-blue-100 text-blue-800 ring-blue-200",
  BETAALD: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};
export function labelDeelbetalingStatus(s: string): string {
  return (DEELBETALING_STATUS as Record<string, string>)[s] ?? s;
}

// --- Deelrevisies ---
export const DEELREVISIE_STATUS = {
  OPENSTAAND: "Openstaand",
  IN_BEWERKING: "In bewerking",
  INGEDIEND: "Ingediend",
  GOEDGEKEURD: "Goedgekeurd",
} as const;
export type DeelrevisieStatus = keyof typeof DEELREVISIE_STATUS;

export const DEELREVISIE_STATUS_KLEUR: Record<DeelrevisieStatus, string> = {
  OPENSTAAND: "bg-slate-100 text-slate-700 ring-slate-200",
  IN_BEWERKING: "bg-amber-100 text-amber-800 ring-amber-200",
  INGEDIEND: "bg-blue-100 text-blue-800 ring-blue-200",
  GOEDGEKEURD: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};
export function labelDeelrevisieStatus(s: string): string {
  return (DEELREVISIE_STATUS as Record<string, string>)[s] ?? s;
}

// --- Documenten ---
export const DOCUMENT_CATEGORIE = {
  DOSSIER: "Projectdossier",
  BUREAUONDERZOEK: "Bureauonderzoek",
  ONDERZOEKSRAPPORT: "Onderzoeksrapport",
  VOORCALCULATIE: "Voorcalculatie (VOCA)",
  MBB: "Materiaalbestellingen (MBB)",
  WERKTEKENINGEN: "Werktekeningenregister",
  WEEKSTAAT: "Weekstaten",
  TERMIJNSTAAT: "Termijnstaat",
  DEELREVISIE: "Deelrevisies",
  OVERIG: "Overig",
} as const;
export function labelDocumentCategorie(c: string): string {
  return (DOCUMENT_CATEGORIE as Record<string, string>)[c] ?? c;
}

// ISO-weeknummer van een datum.
export function isoWeek(d: Date): { jaar: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const jaarStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7);
  return { jaar: date.getUTCFullYear(), week };
}

// Een onderzoek telt als "afgerond" (gereed) bij deze statussen.
export function onderzoekGereed(status: string): boolean {
  return status === "BEOORDEELD";
}
export function onderzoekLoopt(status: string): boolean {
  return ["AANGEVRAAGD", "IN_UITVOERING", "ONTVANGEN"].includes(status);
}
export function onderzoekOpenstaand(status: string): boolean {
  return status === "NOG_AAN_TE_VRAGEN";
}

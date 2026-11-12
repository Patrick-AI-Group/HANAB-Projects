"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  onderzoeksadvies,
  monitoringSamenvatting,
  voorcalculatieAdvies,
  materiaalAdvies,
  werktekeningAdvies,
  deelrevisieAdvies,
  bureauonderzoekRapport,
  type ProjectContext,
} from "@/lib/ai";
import { schrijfOnderzoekRapport } from "@/lib/onderzoekrapport";
import { haalBevindingen, traceCoords, traceLengteMeter } from "@/lib/opendata";
import { volgDeWeg, naarTraceGeoJson } from "@/lib/routing";
import { schrijfDossier } from "@/lib/dossier";
import { setSetting, getApiKey, getModel, STANDAARD_MODEL } from "@/lib/settings";
import { labelOnderzoek, isoWeek } from "@/lib/domein";

function str(v: FormDataEntryValue | null): string {
  return (v ?? "").toString().trim();
}
function optStr(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s.length ? s : null;
}
function optDate(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function num(v: FormDataEntryValue | null): number {
  const n = parseFloat(str(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function optNum(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// --- Projecten -------------------------------------------------------------

export async function maakProject(formData: FormData) {
  const naam = str(formData.get("naam"));
  const opdrachtgever = str(formData.get("opdrachtgever"));
  if (!naam || !opdrachtgever) {
    throw new Error("Naam en opdrachtgever zijn verplicht.");
  }

  // Projectnummer automatisch genereren wanneer leeg gelaten.
  let projectnummer = str(formData.get("projectnummer"));
  if (!projectnummer) {
    const jaar = new Date().getFullYear();
    const aantal = await prisma.project.count();
    projectnummer = `HNB-${jaar}-${String(aantal + 1).padStart(3, "0")}`;
  }

  const project = await prisma.project.create({
    data: {
      projectnummer,
      naam,
      opdrachtgever,
      type: str(formData.get("type")) || "COMBI",
      plaats: optStr(formData.get("plaats")),
      omschrijving: optStr(formData.get("omschrijving")),
      startdatum: optDate(formData.get("startdatum")),
      opleverdatum: optDate(formData.get("opleverdatum")),
      status: "INTAKE",
      activiteiten: {
        create: { type: "STATUS", bericht: "Project aangemaakt in intakefase." },
      },
    },
  });

  revalidatePath("/");
  redirect(`/projecten/${project.id}`);
}

export async function wijzigProjectStatus(formData: FormData) {
  const id = str(formData.get("projectId"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await prisma.project.update({ where: { id }, data: { status } });
  await prisma.activiteit.create({
    data: { projectId: id, type: "STATUS", bericht: `Projectstatus gewijzigd naar ${status}.` },
  });
  revalidatePath(`/projecten/${id}`);
  revalidatePath("/");
}

// --- Conditionerende onderzoeken -------------------------------------------

export async function voegOnderzoekToe(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  const type = str(formData.get("type"));
  if (!projectId || !type) return;

  await prisma.conditionerendOnderzoek.create({
    data: {
      projectId,
      type,
      titel: optStr(formData.get("titel")) ?? labelOnderzoek(type),
      uitvoerder: optStr(formData.get("uitvoerder")),
      verwachtKlaar: optDate(formData.get("verwachtKlaar")),
      verplicht: str(formData.get("verplicht")) === "on",
      status: "NOG_AAN_TE_VRAGEN",
    },
  });
  await prisma.activiteit.create({
    data: { projectId, type: "INFO", bericht: `Onderzoek toegevoegd: ${labelOnderzoek(type)}.` },
  });
  revalidatePath(`/projecten/${projectId}`);
}

export async function wijzigOnderzoekStatus(formData: FormData) {
  const id = str(formData.get("onderzoekId"));
  const projectId = str(formData.get("projectId"));
  const status = str(formData.get("status"));
  if (!id || !status) return;

  const data: Record<string, unknown> = { status };
  // Datums automatisch stempelen bij statusovergangen.
  if (status === "AANGEVRAAGD") data.aanvraagdatum = new Date();
  if (status === "ONTVANGEN") data.ontvangstdatum = new Date();

  await prisma.conditionerendOnderzoek.update({ where: { id }, data });
  if (projectId) {
    await prisma.activiteit.create({
      data: { projectId, type: "STATUS", bericht: `Onderzoekstatus → ${status}.` },
    });
    revalidatePath(`/projecten/${projectId}`);
  }
}

export async function verwijderOnderzoek(formData: FormData) {
  const id = str(formData.get("onderzoekId"));
  const projectId = str(formData.get("projectId"));
  if (!id) return;
  await prisma.conditionerendOnderzoek.delete({ where: { id } });
  if (projectId) revalidatePath(`/projecten/${projectId}`);
}

/** Genereert met AI een rapport voor één conditionerend onderzoek (HANAB-huisstijl). */
export async function genereerOnderzoekRapport(formData: FormData) {
  const onderzoekId = str(formData.get("onderzoekId"));
  if (!onderzoekId) return;
  const projectId = await schrijfOnderzoekRapport(onderzoekId);
  if (projectId) revalidatePath(`/projecten/${projectId}`);
}

// --- AI --------------------------------------------------------------------

async function laadContext(projectId: string): Promise<ProjectContext & { id: string }> {
  const p = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { onderzoeken: true },
  });
  return {
    id: p.id,
    naam: p.naam,
    type: p.type,
    plaats: p.plaats,
    omschrijving: p.omschrijving,
    opdrachtgever: p.opdrachtgever,
    bestaandeOnderzoeken: p.onderzoeken.map((o) => ({
      type: o.type,
      status: o.status,
      verwachtKlaar: o.verwachtKlaar,
      titel: o.titel,
    })),
  };
}

/**
 * Genereert AI-onderzoeksadvies en voegt de geadviseerde onderzoeken toe die
 * nog niet bestaan (op basis van type). Bestaande types worden overgeslagen.
 */
export async function genereerOnderzoeksadvies(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;

  const ctx = await laadContext(projectId);
  const resultaat = await onderzoeksadvies(ctx);

  const bestaandeTypes = new Set((ctx.bestaandeOnderzoeken ?? []).map((o) => o.type));
  let toegevoegd = 0;

  for (const advies of resultaat.adviezen) {
    if (bestaandeTypes.has(advies.type)) continue;
    await prisma.conditionerendOnderzoek.create({
      data: {
        projectId,
        type: advies.type,
        titel: advies.titel,
        verplicht: advies.verplicht,
        status: "NOG_AAN_TE_VRAGEN",
        aiRationale: `${advies.rationale} (indicatieve doorlooptijd ~${advies.doorlooptijdWeken} wkn)`,
      },
    });
    toegevoegd++;
  }

  await prisma.activiteit.create({
    data: {
      projectId,
      type: "AI",
      bericht:
        `AI-onderzoeksadvies (${resultaat.bron === "claude" ? "Claude" : "lokale regels"}): ` +
        `${resultaat.adviezen.length} geadviseerd, ${toegevoegd} nieuw toegevoegd.`,
    },
  });

  revalidatePath(`/projecten/${projectId}`);
}

/** Genereert een AI-monitoringsamenvatting en logt deze als activiteit. */
export async function genereerMonitoring(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const ctx = await laadContext(projectId);
  const resultaat = await monitoringSamenvatting(ctx);
  await prisma.activiteit.create({
    data: {
      projectId,
      type: "AI",
      bericht: `Monitoring (${resultaat.bron === "claude" ? "Claude" : "lokale regels"}): ${resultaat.tekst}`,
    },
  });
  revalidatePath(`/projecten/${projectId}`);
}

// --- Voorcalculatie (VOCA) -------------------------------------------------

export async function genereerVoca(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const ctx = await laadContext(projectId);
  const resultaat = await voorcalculatieAdvies(ctx);

  // Vervang bestaande AI-gegenereerde regels; handmatige regels blijven staan.
  await prisma.vocaRegel.deleteMany({ where: { projectId, aiGegenereerd: true } });
  await prisma.vocaRegel.createMany({
    data: resultaat.regels.map((r) => ({
      projectId,
      omschrijving: r.omschrijving,
      categorie: r.categorie,
      eenheid: r.eenheid,
      hoeveelheid: r.hoeveelheid,
      eenheidsprijs: r.eenheidsprijs,
      aiGegenereerd: true,
    })),
  });

  const totaal = resultaat.regels.reduce((s, r) => s + r.hoeveelheid * r.eenheidsprijs, 0);
  await prisma.activiteit.create({
    data: {
      projectId,
      type: "AI",
      bericht:
        `Voorcalculatie (${resultaat.bron === "claude" ? "Claude" : "lokale regels"}): ` +
        `${resultaat.regels.length} regels, raming € ${Math.round(totaal).toLocaleString("nl-NL")}.`,
    },
  });
  revalidatePath(`/projecten/${projectId}`);
}

export async function voegVocaRegelToe(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  const omschrijving = str(formData.get("omschrijving"));
  if (!projectId || !omschrijving) return;
  await prisma.vocaRegel.create({
    data: {
      projectId,
      omschrijving,
      categorie: str(formData.get("categorie")) || "OVERIG",
      eenheid: str(formData.get("eenheid")) || "post",
      hoeveelheid: num(formData.get("hoeveelheid")),
      eenheidsprijs: num(formData.get("eenheidsprijs")),
      aiGegenereerd: false,
    },
  });
  revalidatePath(`/projecten/${projectId}`);
}

export async function verwijderVocaRegel(formData: FormData) {
  const id = str(formData.get("regelId"));
  const projectId = str(formData.get("projectId"));
  if (!id) return;
  await prisma.vocaRegel.delete({ where: { id } });
  if (projectId) revalidatePath(`/projecten/${projectId}`);
}

// --- Materiaal Bestellingen Bestand (MBB) ----------------------------------

export async function genereerMBB(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const ctx = await laadContext(projectId);
  const voca = await prisma.vocaRegel.findMany({ where: { projectId } });
  const resultaat = await materiaalAdvies(
    ctx,
    voca.map((v) => ({
      omschrijving: v.omschrijving,
      categorie: v.categorie,
      eenheid: v.eenheid,
      hoeveelheid: v.hoeveelheid,
      eenheidsprijs: v.eenheidsprijs,
    }))
  );

  const uitVoca = voca.some((v) => v.categorie === "MATERIAAL");
  // Vervang eerdere automatisch gegenereerde regels (bron VOCA/AI).
  await prisma.materiaalRegel.deleteMany({
    where: { projectId, bron: { in: ["VOCA", "AI"] } },
  });
  await prisma.materiaalRegel.createMany({
    data: resultaat.regels.map((r) => ({
      projectId,
      artikel: r.artikel,
      eenheid: r.eenheid,
      hoeveelheid: r.hoeveelheid,
      leverancier: r.leverancier ?? null,
      eenheidsprijs: r.eenheidsprijs ?? null,
      status: "TE_BESTELLEN",
      bron: uitVoca ? "VOCA" : "AI",
    })),
  });

  await prisma.activiteit.create({
    data: {
      projectId,
      type: "AI",
      bericht:
        `Materiaalbestellingen (${uitVoca ? "uit voorcalculatie" : resultaat.bron === "claude" ? "Claude" : "lokale regels"}): ` +
        `${resultaat.regels.length} artikelen klaargezet.`,
    },
  });
  revalidatePath(`/projecten/${projectId}`);
}

export async function voegMateriaalToe(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  const artikel = str(formData.get("artikel"));
  if (!projectId || !artikel) return;
  await prisma.materiaalRegel.create({
    data: {
      projectId,
      artikel,
      eenheid: str(formData.get("eenheid")) || "st",
      hoeveelheid: num(formData.get("hoeveelheid")),
      leverancier: optStr(formData.get("leverancier")),
      eenheidsprijs: optNum(formData.get("eenheidsprijs")),
      status: "TE_BESTELLEN",
      bron: "HANDMATIG",
    },
  });
  revalidatePath(`/projecten/${projectId}`);
}

export async function wijzigMateriaalStatus(formData: FormData) {
  const id = str(formData.get("regelId"));
  const projectId = str(formData.get("projectId"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await prisma.materiaalRegel.update({ where: { id }, data: { status } });
  if (projectId) revalidatePath(`/projecten/${projectId}`);
}

export async function verwijderMateriaal(formData: FormData) {
  const id = str(formData.get("regelId"));
  const projectId = str(formData.get("projectId"));
  if (!id) return;
  await prisma.materiaalRegel.delete({ where: { id } });
  if (projectId) revalidatePath(`/projecten/${projectId}`);
}

// --- Werktekeningen --------------------------------------------------------

export async function genereerWerktekeningen(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const ctx = await laadContext(projectId);
  const resultaat = await werktekeningAdvies(ctx);

  const bestaand = await prisma.werktekening.findMany({ where: { projectId }, select: { titel: true } });
  const bestaandeTitels = new Set(bestaand.map((t) => t.titel.toLowerCase()));
  let toegevoegd = 0;
  for (const t of resultaat.tekeningen) {
    if (bestaandeTitels.has(t.titel.toLowerCase())) continue;
    await prisma.werktekening.create({
      data: {
        projectId,
        titel: t.titel,
        discipline: t.discipline,
        status: "CONCEPT",
        aiRationale: t.rationale || null,
      },
    });
    toegevoegd++;
  }
  await prisma.activiteit.create({
    data: {
      projectId,
      type: "AI",
      bericht: `Werktekeningadvies (${resultaat.bron === "claude" ? "Claude" : "lokale regels"}): ${resultaat.tekeningen.length} geadviseerd, ${toegevoegd} nieuw.`,
    },
  });
  revalidatePath(`/projecten/${projectId}`);
}

export async function voegWerktekeningToe(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  const titel = str(formData.get("titel"));
  if (!projectId || !titel) return;
  await prisma.werktekening.create({
    data: {
      projectId,
      titel,
      tekeningnummer: optStr(formData.get("tekeningnummer")),
      discipline: str(formData.get("discipline")) || "TRACE",
      versie: str(formData.get("versie")) || "A",
      tekenaar: optStr(formData.get("tekenaar")),
      status: "CONCEPT",
    },
  });
  revalidatePath(`/projecten/${projectId}`);
}

export async function wijzigWerktekeningStatus(formData: FormData) {
  const id = str(formData.get("tekeningId"));
  const projectId = str(formData.get("projectId"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await prisma.werktekening.update({ where: { id }, data: { status } });
  if (projectId) revalidatePath(`/projecten/${projectId}`);
}

export async function verwijderWerktekening(formData: FormData) {
  const id = str(formData.get("tekeningId"));
  const projectId = str(formData.get("projectId"));
  if (!id) return;
  await prisma.werktekening.delete({ where: { id } });
  if (projectId) revalidatePath(`/projecten/${projectId}`);
}

// --- Weekproducties --------------------------------------------------------

/**
 * Maakt een nieuwe weekproductie. De productieregels worden automatisch
 * voorgevuld vanuit de voorcalculatie (gepland = VOCA-hoeveelheid,
 * gerealiseerd = 0), zodat alleen de werkelijke productie ingevuld hoeft te
 * worden. Zonder VOCA ontstaat een lege week.
 */
export async function maakWeekproductie(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const now = new Date();
  const { jaar, week } = isoWeek(now);

  const voca = await prisma.vocaRegel.findMany({ where: { projectId } });
  // Alleen uitvoerbare werkposten voorvullen (geen vergunningen/onderzoek).
  const werkbaar = voca.filter((v) => v.categorie !== "VERGUNNINGEN");

  const wp = await prisma.weekproductie.create({
    data: {
      projectId,
      jaar: num(formData.get("jaar")) || jaar,
      week: num(formData.get("week")) || week,
      status: "CONCEPT",
      regels: {
        create: werkbaar.map((v) => ({
          omschrijving: v.omschrijving,
          eenheid: v.eenheid,
          gepland: v.hoeveelheid,
          gerealiseerd: 0,
          eenheidsprijs: v.eenheidsprijs,
        })),
      },
    },
  });
  await prisma.activiteit.create({
    data: {
      projectId,
      type: "INFO",
      bericht: `Weekproductie ${wp.jaar}-W${wp.week} aangemaakt${werkbaar.length ? ` (voorgevuld met ${werkbaar.length} posten uit VOCA)` : ""}.`,
    },
  });
  revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function updateRealisatie(formData: FormData) {
  const id = str(formData.get("regelId"));
  const projectId = str(formData.get("projectId"));
  if (!id) return;
  await prisma.weekproductieRegel.update({
    where: { id },
    data: { gerealiseerd: num(formData.get("gerealiseerd")) },
  });
  if (projectId) revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function voegWeekproductieRegelToe(formData: FormData) {
  const weekproductieId = str(formData.get("weekproductieId"));
  const projectId = str(formData.get("projectId"));
  const omschrijving = str(formData.get("omschrijving"));
  if (!weekproductieId || !omschrijving) return;
  await prisma.weekproductieRegel.create({
    data: {
      weekproductieId,
      omschrijving,
      eenheid: str(formData.get("eenheid")) || "m1",
      gepland: num(formData.get("gepland")),
      gerealiseerd: num(formData.get("gerealiseerd")),
      eenheidsprijs: num(formData.get("eenheidsprijs")),
    },
  });
  if (projectId) revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function wijzigWeekproductieStatus(formData: FormData) {
  const id = str(formData.get("weekproductieId"));
  const projectId = str(formData.get("projectId"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await prisma.weekproductie.update({ where: { id }, data: { status } });
  if (projectId) revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function verwijderWeekproductie(formData: FormData) {
  const id = str(formData.get("weekproductieId"));
  const projectId = str(formData.get("projectId"));
  if (!id) return;
  await prisma.weekproductie.delete({ where: { id } });
  if (projectId) revalidatePath(`/projecten/${projectId}/uitvoering`);
}

// --- Deelbetalingen (termijnen) --------------------------------------------

/** Totale gerealiseerde productie (euro) over alle weekproducties. */
async function gerealiseerdeProductie(projectId: string): Promise<number> {
  const regels = await prisma.weekproductieRegel.findMany({
    where: { weekproductie: { projectId } },
    select: { gerealiseerd: true, eenheidsprijs: true },
  });
  return regels.reduce((s, r) => s + r.gerealiseerd * r.eenheidsprijs, 0);
}

/**
 * Genereert een nieuwe termijn (deelbetaling): het bedrag is de gerealiseerde
 * productie tot nu toe minus wat al eerder in termijnen is opgenomen.
 */
export async function genereerDeelbetaling(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;

  const gerealiseerd = await gerealiseerdeProductie(projectId);
  const bestaande = await prisma.deelbetaling.findMany({ where: { projectId } });
  const reedsGefactureerd = bestaande.reduce((s, d) => s + d.bedrag, 0);
  const bedrag = Math.max(0, Math.round((gerealiseerd - reedsGefactureerd) * 100) / 100);
  const termijn = bestaande.length + 1;

  await prisma.deelbetaling.create({
    data: {
      projectId,
      termijn,
      datum: new Date(),
      omschrijving: `Termijn ${termijn} — gerealiseerde productie t/m nu`,
      bedrag,
      status: "CONCEPT",
    },
  });
  await prisma.activiteit.create({
    data: {
      projectId,
      type: "STATUS",
      bericht: `Deelbetaling termijn ${termijn} aangemaakt: € ${bedrag.toLocaleString("nl-NL")} (gerealiseerd € ${Math.round(gerealiseerd).toLocaleString("nl-NL")}, reeds gefactureerd € ${Math.round(reedsGefactureerd).toLocaleString("nl-NL")}).`,
    },
  });
  revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function voegDeelbetalingToe(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const bestaande = await prisma.deelbetaling.count({ where: { projectId } });
  await prisma.deelbetaling.create({
    data: {
      projectId,
      termijn: bestaande + 1,
      datum: optDate(formData.get("datum")) ?? new Date(),
      omschrijving: optStr(formData.get("omschrijving")),
      bedrag: num(formData.get("bedrag")),
      status: "CONCEPT",
    },
  });
  revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function wijzigDeelbetalingStatus(formData: FormData) {
  const id = str(formData.get("deelbetalingId"));
  const projectId = str(formData.get("projectId"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await prisma.deelbetaling.update({ where: { id }, data: { status } });
  if (projectId) revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function verwijderDeelbetaling(formData: FormData) {
  const id = str(formData.get("deelbetalingId"));
  const projectId = str(formData.get("projectId"));
  if (!id) return;
  await prisma.deelbetaling.delete({ where: { id } });
  if (projectId) revalidatePath(`/projecten/${projectId}/uitvoering`);
}

// --- Deelrevisies ----------------------------------------------------------

export async function genereerDeelrevisies(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const ctx = await laadContext(projectId);
  const resultaat = await deelrevisieAdvies(ctx);

  const bestaand = await prisma.deelrevisie.findMany({ where: { projectId }, select: { deel: true } });
  const bestaandeDelen = new Set(bestaand.map((d) => d.deel.toLowerCase()));
  let toegevoegd = 0;
  for (const r of resultaat.revisies) {
    if (bestaandeDelen.has(r.deel.toLowerCase())) continue;
    await prisma.deelrevisie.create({
      data: {
        projectId,
        deel: r.deel,
        omschrijving: r.omschrijving || null,
        aiRationale: r.rationale || null,
        status: "OPENSTAAND",
      },
    });
    toegevoegd++;
  }
  await prisma.activiteit.create({
    data: {
      projectId,
      type: "AI",
      bericht: `Deelrevisie-advies (${resultaat.bron === "claude" ? "Claude" : "lokale regels"}): ${resultaat.revisies.length} geadviseerd, ${toegevoegd} nieuw.`,
    },
  });
  revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function voegDeelrevisieToe(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  const deel = str(formData.get("deel"));
  if (!projectId || !deel) return;
  await prisma.deelrevisie.create({
    data: {
      projectId,
      deel,
      omschrijving: optStr(formData.get("omschrijving")),
      status: "OPENSTAAND",
    },
  });
  revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function wijzigDeelrevisieStatus(formData: FormData) {
  const id = str(formData.get("revisieId"));
  const projectId = str(formData.get("projectId"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await prisma.deelrevisie.update({ where: { id }, data: { status } });
  if (projectId) revalidatePath(`/projecten/${projectId}/uitvoering`);
}

export async function verwijderDeelrevisie(formData: FormData) {
  const id = str(formData.get("revisieId"));
  const projectId = str(formData.get("projectId"));
  if (!id) return;
  await prisma.deelrevisie.delete({ where: { id } });
  if (projectId) revalidatePath(`/projecten/${projectId}/uitvoering`);
}

// --- Kaart & bureauonderzoek -----------------------------------------------

export async function opslaanTrace(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  const trace = str(formData.get("trace"));
  if (!projectId || !trace) return;
  // Valideer dat het geldige GeoJSON met coördinaten is.
  const coords = traceCoords(trace);
  if (coords.length < 2) return;
  await prisma.project.update({ where: { id: projectId }, data: { traceGeoJson: trace } });
  await prisma.activiteit.create({
    data: {
      projectId,
      type: "INFO",
      bericht: `Tracé ingetekend/bijgewerkt (ca. ${traceLengteMeter(coords)} m, ${coords.length} punten).`,
    },
  });
  revalidatePath(`/projecten/${projectId}/kaart`);
}

/** Legt het ingetekende tracé op de dichtstbijzijnde wegroute (berm). */
export async function snapTraceAanDeWeg(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const pr = await prisma.project.findUnique({ where: { id: projectId } });
  if (!pr?.traceGeoJson) return;
  const c = traceCoords(pr.traceGeoJson);
  if (c.length < 2) return;
  const weg = await volgDeWeg([c[0], c[c.length - 1]]);
  if (weg && weg.length >= 2) {
    await prisma.project.update({ where: { id: projectId }, data: { traceGeoJson: naarTraceGeoJson(weg) } });
    await prisma.activiteit.create({
      data: { projectId, type: "INFO", bericht: `Tracé op de weg gelegd (berm) via routering — ${weg.length} punten.` },
    });
  }
  revalidatePath(`/projecten/${projectId}/kaart`);
}

export async function genereerBureauonderzoek(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.traceGeoJson) return;

  const coords = traceCoords(project.traceGeoJson);
  const lengte = traceLengteMeter(coords);
  const bevindingen = await haalBevindingen(project.traceGeoJson);

  const ctx: ProjectContext = {
    naam: project.naam,
    type: project.type,
    plaats: project.plaats,
    omschrijving: project.omschrijving,
    opdrachtgever: project.opdrachtgever,
  };
  const rapport = await bureauonderzoekRapport(ctx, bevindingen, lengte);

  await prisma.bureauonderzoek.upsert({
    where: { projectId },
    create: {
      projectId,
      bevindingenJson: JSON.stringify(bevindingen),
      rapport: rapport.rapport,
      bron: rapport.bron,
      gegenereerdOp: new Date(),
    },
    update: {
      bevindingenJson: JSON.stringify(bevindingen),
      rapport: rapport.rapport,
      bron: rapport.bron,
      gegenereerdOp: new Date(),
    },
  });

  const live = bevindingen.filter((b) => b.beschikbaar).length;
  await prisma.activiteit.create({
    data: {
      projectId,
      type: "AI",
      bericht:
        `Bureauonderzoek gegenereerd (${rapport.bron === "claude" ? "Claude" : "lokale regels"}): ` +
        `${live}/${bevindingen.length} bronnen live geraadpleegd langs ${lengte} m tracé.`,
    },
  });
  revalidatePath(`/projecten/${projectId}/kaart`);
}

/**
 * Zet de bevindingen uit het bureauonderzoek om in concrete conditionerende
 * onderzoeken op het project (bestaande types worden overgeslagen).
 */
export async function onderzoekenUitBureauonderzoek(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const bo = await prisma.bureauonderzoek.findUnique({ where: { projectId } });
  if (!bo?.bevindingenJson) return;

  let bevindingen: any[] = [];
  try {
    bevindingen = JSON.parse(bo.bevindingenJson);
  } catch {
    return;
  }

  const themaNaarType: Record<string, string> = {
    "Bodem & milieu": "BODEM_MILIEU",
    Archeologie: "ARCHEOLOGIE",
    Natuur: "FLORA_FAUNA",
    Geotechniek: "GEOTECHNIEK",
    Water: "WATER_BEMALING",
  };

  // Altijd een KLIC-melding (verplichte graafmelding), los van bevindingen.
  const teMaken: { type: string; verplicht: boolean; rationale: string }[] = [
    { type: "KLIC", verplicht: true, rationale: "Wettelijk verplichte graafmelding (WIBON) vóór aanvang graafwerk." },
  ];
  for (const b of bevindingen) {
    const type = themaNaarType[b.thema];
    if (!type) continue;
    const heeftData = typeof b.aantal === "number" && b.aantal > 0;
    const verplicht = type === "BODEM_MILIEU" || ((type === "FLORA_FAUNA" || type === "GEOTECHNIEK") && heeftData);
    teMaken.push({ type, verplicht, rationale: b.samenvatting ?? "" });
  }

  const bestaand = await prisma.conditionerendOnderzoek.findMany({ where: { projectId }, select: { type: true } });
  const bestaandeTypes = new Set(bestaand.map((o) => o.type));

  let toegevoegd = 0;
  for (const t of teMaken) {
    if (bestaandeTypes.has(t.type)) continue;
    await prisma.conditionerendOnderzoek.create({
      data: {
        projectId,
        type: t.type,
        titel: labelOnderzoek(t.type),
        verplicht: t.verplicht,
        status: "NOG_AAN_TE_VRAGEN",
        aiRationale: `Uit bureauonderzoek: ${t.rationale}`,
      },
    });
    bestaandeTypes.add(t.type);
    toegevoegd++;
  }

  await prisma.activiteit.create({
    data: {
      projectId,
      type: "AI",
      bericht: `Bureauonderzoek omgezet naar onderzoekenlijst: ${toegevoegd} onderzoek(en) toegevoegd.`,
    },
  });
  revalidatePath(`/projecten/${projectId}`);
  revalidatePath(`/projecten/${projectId}/kaart`);
}

// --- Dossierdocumenten -----------------------------------------------------

/** (Her)genereert alle dossierdocumenten op basis van de huidige projectdata. */
export async function genereerDossierDocumentenAction(formData: FormData) {
  const projectId = str(formData.get("projectId"));
  if (!projectId) return;
  const aantal = await schrijfDossier(projectId);
  await prisma.activiteit.create({
    data: { projectId, type: "INFO", bericht: `Dossierdocumenten gegenereerd/ververst (${aantal} stuks).` },
  });
  revalidatePath(`/projecten/${projectId}`);
}

// --- Instellingen ----------------------------------------------------------

export async function opslaanInstellingen(formData: FormData) {
  const key = str(formData.get("apikey"));
  const model = str(formData.get("model"));
  // Alleen overschrijven als er een nieuwe sleutel is ingevuld.
  if (key) await setSetting("ANTHROPIC_API_KEY", key);
  await setSetting("ANTHROPIC_MODEL", model || STANDAARD_MODEL);
  revalidatePath("/instellingen");
}

export async function wisApiKey() {
  await setSetting("ANTHROPIC_API_KEY", "");
  await setSetting("laatste_test", "");
  revalidatePath("/instellingen");
}

export async function testVerbinding() {
  const key = await getApiKey();
  let resultaat: { ok: boolean; bericht: string };
  if (!key) {
    resultaat = { ok: false, bericht: "Geen API-sleutel ingesteld." };
  } else {
    try {
      const mod = await import("@anthropic-ai/sdk");
      const client = new mod.default({ apiKey: key });
      const model = await getModel();
      const r = await client.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Antwoord met: OK" }],
      });
      const txt = (r.content as any[])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      resultaat = { ok: true, bericht: `Verbinding OK — model ${r.model}. Antwoord: "${txt.slice(0, 40)}"` };
    } catch (e: any) {
      resultaat = { ok: false, bericht: `Mislukt: ${e?.message ?? String(e)}` };
    }
  }
  await setSetting("laatste_test", JSON.stringify({ ...resultaat, tijd: new Date().toISOString() }));
  revalidatePath("/instellingen");
}

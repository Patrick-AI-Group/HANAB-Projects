// Branded PDF-export van een enkele tabel (bv. MBB) met pdfkit.
import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { labelMbbStatus, labelProjectType, labelVocaCategorie, labelDeelbetalingStatus, euro } from "./domein";

const NAVY = "#00214b";
const ACCENT = "#e63223";
const GRIJS = "#e2e8f0";
const TEKST = "#0f172a";
const M = 40;

type Doc = PDFKit.PDFDocument;

interface Kolom {
  label: string;
  weight: number;
  num?: boolean;
}

function nieuwDoc(): { doc: Doc; chunks: Buffer[]; klaar: Promise<void> } {
  const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const klaar = new Promise<void>((res) => doc.on("end", () => res()));
  return { doc, chunks, klaar };
}

// Navy kopbalk met logo, titel rechtsboven, projectnaam + subtitel.
function tekenKop(doc: Doc, titel: string, projectnaam: string, subtitel: string) {
  const pageW = doc.page.width;
  const contentW = pageW - 2 * M;
  doc.rect(0, 0, pageW, 86).fill(NAVY);
  doc.rect(0, 86, pageW, 4).fill(ACCENT);
  try {
    const svg = readFileSync(path.join(process.cwd(), "public", "images", "logo-white.svg"), "utf8");
    SVGtoPDF(doc, svg, M, 26, { width: 120 });
  } catch {
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("Hanab.", M, 24);
  }
  doc.font("Helvetica").fontSize(10).fillColor("#c7d3e2").text("BMS — " + titel, pageW - M - 240, 30, { width: 240, align: "right" });
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffffff").text(projectnaam, M, 62, { width: contentW });
  doc.y = 104;
  doc.fillColor(TEKST).font("Helvetica").fontSize(9).text(subtitel, M, doc.y, { width: contentW });
  doc.moveDown(1);
}

// Gewogen tabel met navy koprij, zebra en optionele totaalrij; breekt over pagina's.
function tekenTabel(doc: Doc, kolommen: Kolom[], rijen: string[][], totaal?: string[]) {
  const pageW = doc.page.width;
  const contentW = pageW - 2 * M;
  const bottom = doc.page.height - M;
  const som = kolommen.reduce((a, k) => a + k.weight, 0);
  const widths = kolommen.map((k) => (k.weight / som) * contentW);
  const fs = 8.5;
  const pad = 4;
  const rij = (cells: string[], soort: "kop" | "normaal" | "totaal") => {
    const vet = soort === "kop" || soort === "totaal";
    doc.fontSize(fs).font(vet ? "Helvetica-Bold" : "Helvetica");
    const h =
      Math.max(12, ...cells.map((c, i) => doc.heightOfString(c || "", { width: widths[i] - 2 * pad, align: kolommen[i].num ? "right" : "left" }))) +
      2 * pad;
    if (doc.y + h > bottom) doc.addPage();
    const y = doc.y;
    if (soort === "kop") doc.rect(M, y, contentW, h).fill(NAVY);
    else if (soort === "totaal") doc.rect(M, y, contentW, h).fill("#eef2f7");
    let x = M;
    cells.forEach((c, i) => {
      doc
        .fillColor(soort === "kop" ? "#ffffff" : TEKST)
        .font(vet ? "Helvetica-Bold" : "Helvetica")
        .fontSize(fs)
        .text(c || "", x + pad, y + pad, { width: widths[i] - 2 * pad, align: kolommen[i].num ? "right" : "left" });
      x += widths[i];
    });
    doc.moveTo(M, y + h).lineTo(M + contentW, y + h).strokeColor(GRIJS).lineWidth(0.5).stroke();
    doc.y = y + h;
    doc.fillColor(TEKST);
  };
  rij(kolommen.map((k) => k.label), "kop");
  rijen.forEach((r) => rij(r, "normaal"));
  if (totaal) rij(totaal, "totaal");
}

// Voettekst met paginanummering op alle gebufferde pagina's.
function tekenVoettekst(doc: Doc, titel: string) {
  const pageW = doc.page.width;
  const contentW = pageW - 2 * M;
  try {
    const pager = doc as unknown as { bufferedPageRange(): { start: number; count: number }; switchToPage(n: number): void; flushPages(): void };
    const range = pager.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pager.switchToPage(i);
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 26;
      doc.moveTo(M, fy - 6).lineTo(pageW - M, fy - 6).strokeColor(GRIJS).lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor("#64748b");
      doc.text(`HANAB BMS · ${titel}`, M, fy, { width: contentW - 160, align: "left", lineBreak: false });
      doc.text(`Pagina ${i - range.start + 1} van ${range.count}`, pageW - M - 160, fy, { width: 160, align: "right", lineBreak: false });
    }
    pager.flushPages();
  } catch {
    /* voettekst optioneel */
  }
}

export async function tabelPdf(opts: {
  titel: string;
  subtitel: string;
  projectnaam: string;
  kolommen: Kolom[];
  rijen: string[][];
  totaal?: string[];
}): Promise<Buffer> {
  const { doc, chunks, klaar } = nieuwDoc();
  tekenKop(doc, opts.titel, opts.projectnaam, opts.subtitel);
  tekenTabel(doc, opts.kolommen, opts.rijen, opts.totaal);
  tekenVoettekst(doc, opts.titel);
  doc.end();
  await klaar;
  return Buffer.concat(chunks);
}

export function vocaPdf(project: any): Promise<Buffer> {
  const totaal = (project.vocaRegels ?? []).reduce((s: number, r: any) => s + r.hoeveelheid * r.eenheidsprijs, 0);
  return tabelPdf({
    titel: "Voorcalculatie (VOCA)",
    projectnaam: project.naam,
    subtitel: `${project.projectnummer} · ${project.opdrachtgever} · ${labelProjectType(project.type)}${project.plaats ? " · " + project.plaats : ""} · opgesteld ${new Date().toLocaleDateString("nl-NL")}`,
    kolommen: [
      { label: "Omschrijving", weight: 4 },
      { label: "Categorie", weight: 2 },
      { label: "Hoev.", weight: 1, num: true },
      { label: "Eenh.", weight: 0.9 },
      { label: "Prijs/eenh.", weight: 1.4, num: true },
      { label: "Bedrag", weight: 1.5, num: true },
    ],
    rijen: (project.vocaRegels ?? []).map((r: any) => [
      r.omschrijving,
      labelVocaCategorie(r.categorie),
      String(r.hoeveelheid),
      r.eenheid,
      euro(r.eenheidsprijs),
      euro(r.hoeveelheid * r.eenheidsprijs),
    ]),
    totaal: ["Totaal (excl. btw)", "", "", "", "", euro(totaal)],
  });
}

export function mbbPdf(project: any): Promise<Buffer> {
  return tabelPdf({
    titel: "Materiaalbestellingen (MBB)",
    projectnaam: project.naam,
    subtitel: `${project.projectnummer} · ${project.opdrachtgever} · ${labelProjectType(project.type)}${project.plaats ? " · " + project.plaats : ""} · opgesteld ${new Date().toLocaleDateString("nl-NL")}`,
    kolommen: [
      { label: "Artikel", weight: 4 },
      { label: "Hoev.", weight: 1, num: true },
      { label: "Eenh.", weight: 0.9 },
      { label: "Leverancier", weight: 2 },
      { label: "Eenheidsprijs", weight: 1.4, num: true },
      { label: "Status", weight: 1.4 },
    ],
    rijen: (project.materiaalRegels ?? []).map((m: any) => [
      m.artikel,
      String(m.hoeveelheid),
      m.eenheid,
      m.leverancier ?? "—",
      typeof m.eenheidsprijs === "number" ? "€ " + m.eenheidsprijs.toFixed(2).replace(".", ",") : "—",
      labelMbbStatus(m.status),
    ]),
  });
}

// Aggregeert alle weekproductieregels per post (omschrijving + eenheid + prijs).
function productiePerPost(project: any): { omschrijving: string; eenheid: string; gerealiseerd: number; eenheidsprijs: number }[] {
  const kaart = new Map<string, { omschrijving: string; eenheid: string; gerealiseerd: number; eenheidsprijs: number }>();
  for (const w of project.weekproducties ?? []) {
    for (const r of w.regels ?? []) {
      const sleutel = `${r.omschrijving}|${r.eenheid}|${r.eenheidsprijs}`;
      const bestaand = kaart.get(sleutel);
      if (bestaand) bestaand.gerealiseerd += r.gerealiseerd;
      else kaart.set(sleutel, { omschrijving: r.omschrijving, eenheid: r.eenheid, gerealiseerd: r.gerealiseerd, eenheidsprijs: r.eenheidsprijs });
    }
  }
  return [...kaart.values()];
}

// Deelafrekenstaat (termijnafrekening) voor één deelbetaling, met productie-onderbouwing.
export async function deelafrekeningPdf(deelbetaling: any): Promise<Buffer> {
  const project = deelbetaling.project;
  const posten = productiePerPost(project).filter((p) => p.gerealiseerd !== 0);
  const gerealiseerdTotaal = posten.reduce((s, p) => s + p.gerealiseerd * p.eenheidsprijs, 0);
  const reedsGefactureerd = (project.deelbetalingen ?? [])
    .filter((d: any) => d.termijn < deelbetaling.termijn)
    .reduce((s: number, d: any) => s + d.bedrag, 0);
  const dezeTermijn = deelbetaling.bedrag;
  const nogTeFactureren = gerealiseerdTotaal - reedsGefactureerd - dezeTermijn;
  const titel = `Deelafrekenstaat · Termijn ${deelbetaling.termijn}`;
  const datum = deelbetaling.datum ? new Date(deelbetaling.datum).toLocaleDateString("nl-NL") : new Date().toLocaleDateString("nl-NL");

  const { doc, chunks, klaar } = nieuwDoc();
  tekenKop(
    doc,
    titel,
    project.naam,
    `${project.projectnummer} · ${project.opdrachtgever} · ${labelProjectType(project.type)}${project.plaats ? " · " + project.plaats : ""} · afrekendatum ${datum} · ${labelDeelbetalingStatus(deelbetaling.status)}`,
  );

  if (deelbetaling.omschrijving) {
    doc.fillColor("#475569").font("Helvetica-Oblique").fontSize(9).text(deelbetaling.omschrijving, M, doc.y, { width: doc.page.width - 2 * M });
    doc.moveDown(0.8);
  }

  // Onderbouwing: gerealiseerde productie per post.
  doc.fillColor(TEKST).font("Helvetica-Bold").fontSize(10).text("Gerealiseerde productie (onderbouwing)", M, doc.y);
  doc.moveDown(0.4);
  tekenTabel(
    doc,
    [
      { label: "Post", weight: 4 },
      { label: "Eenh.", weight: 0.9 },
      { label: "Gerealiseerd", weight: 1.4, num: true },
      { label: "Prijs/eenh.", weight: 1.4, num: true },
      { label: "Productie", weight: 1.6, num: true },
    ],
    posten.map((p) => [
      p.omschrijving,
      p.eenheid,
      String(p.gerealiseerd),
      euro(p.eenheidsprijs),
      euro(p.gerealiseerd * p.eenheidsprijs),
    ]),
    ["Totaal gerealiseerde productie (excl. btw)", "", "", "", euro(gerealiseerdTotaal)],
  );

  // Afrekening van deze termijn.
  doc.moveDown(1.2);
  doc.fillColor(TEKST).font("Helvetica-Bold").fontSize(10).text("Afrekening", M, doc.y);
  doc.moveDown(0.4);
  tekenTabel(
    doc,
    [
      { label: "Afrekening", weight: 4 },
      { label: "Bedrag (excl. btw)", weight: 1.6, num: true },
    ],
    [
      ["Gerealiseerde productie t/m heden", euro(gerealiseerdTotaal)],
      ["Reeds gefactureerd (vorige termijnen)", "– " + euro(reedsGefactureerd)],
    ],
    [`Deze deelafrekening — termijn ${deelbetaling.termijn}`, euro(dezeTermijn)],
  );
  doc.moveDown(0.6);
  doc.fillColor("#475569").font("Helvetica").fontSize(9).text(
    `Nog te factureren na deze termijn: ${euro(nogTeFactureren)}`,
    M,
    doc.y,
    { width: doc.page.width - 2 * M, align: "right" },
  );

  tekenVoettekst(doc, titel);
  doc.end();
  await klaar;
  return Buffer.concat(chunks);
}

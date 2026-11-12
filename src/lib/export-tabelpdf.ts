// Branded PDF-export van een enkele tabel (bv. MBB) met pdfkit.
import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { labelMbbStatus, labelProjectType, labelVocaCategorie, euro } from "./domein";

const NAVY = "#00214b";
const ACCENT = "#e63223";
const GRIJS = "#e2e8f0";
const TEKST = "#0f172a";

interface Kolom {
  label: string;
  weight: number;
  num?: boolean;
}

export async function tabelPdf(opts: {
  titel: string;
  subtitel: string;
  projectnaam: string;
  kolommen: Kolom[];
  rijen: string[][];
  totaal?: string[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const klaar = new Promise<void>((res) => doc.on("end", () => res()));

  const M = 40;
  const pageW = doc.page.width;
  const contentW = pageW - 2 * M;
  const bottom = doc.page.height - M;

  // Kop met logo
  doc.rect(0, 0, pageW, 86).fill(NAVY);
  doc.rect(0, 86, pageW, 4).fill(ACCENT);
  try {
    const svg = readFileSync(path.join(process.cwd(), "public", "images", "logo-white.svg"), "utf8");
    SVGtoPDF(doc, svg, M, 26, { width: 120 });
  } catch {
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("Hanab.", M, 24);
  }
  doc.font("Helvetica").fontSize(10).fillColor("#c7d3e2").text("BMS — " + opts.titel, pageW - M - 240, 30, { width: 240, align: "right" });
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffffff").text(opts.projectnaam, M, 62, { width: contentW });
  doc.y = 104;
  doc.fillColor(TEKST).font("Helvetica").fontSize(9).text(opts.subtitel, M, doc.y, { width: contentW });
  doc.moveDown(1);

  // Tabel
  const som = opts.kolommen.reduce((a, k) => a + k.weight, 0);
  const widths = opts.kolommen.map((k) => (k.weight / som) * contentW);
  const fs = 8.5;
  const pad = 4;
  const rij = (cells: string[], soort: "kop" | "normaal" | "totaal") => {
    const vet = soort === "kop" || soort === "totaal";
    doc.fontSize(fs).font(vet ? "Helvetica-Bold" : "Helvetica");
    const h =
      Math.max(12, ...cells.map((c, i) => doc.heightOfString(c || "", { width: widths[i] - 2 * pad, align: opts.kolommen[i].num ? "right" : "left" }))) +
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
        .text(c || "", x + pad, y + pad, { width: widths[i] - 2 * pad, align: opts.kolommen[i].num ? "right" : "left" });
      x += widths[i];
    });
    doc.moveTo(M, y + h).lineTo(M + contentW, y + h).strokeColor(GRIJS).lineWidth(0.5).stroke();
    doc.y = y + h;
    doc.fillColor(TEKST);
  };
  rij(opts.kolommen.map((k) => k.label), "kop");
  opts.rijen.forEach((r) => rij(r, "normaal"));
  if (opts.totaal) rij(opts.totaal, "totaal");

  // Voettekst
  try {
    const pager = doc as unknown as { bufferedPageRange(): { start: number; count: number }; switchToPage(n: number): void; flushPages(): void };
    const range = pager.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pager.switchToPage(i);
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 26;
      doc.moveTo(M, fy - 6).lineTo(pageW - M, fy - 6).strokeColor(GRIJS).lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor("#64748b");
      doc.text(`HANAB BMS · ${opts.titel}`, M, fy, { width: contentW - 160, align: "left", lineBreak: false });
      doc.text(`Pagina ${i - range.start + 1} van ${range.count}`, pageW - M - 160, fy, { width: 160, align: "right", lineBreak: false });
    }
    pager.flushPages();
  } catch {
    /* voettekst optioneel */
  }

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

// Excel-export (.xlsx) van MBB en VOCA met ExcelJS.
import ExcelJS from "exceljs";
import { labelMbbStatus, labelProjectType, labelVocaCategorie } from "./domein";

function kop(ws: ExcelJS.Worksheet, project: any, titel: string, aantalKolommen: number) {
  const laatste = String.fromCharCode(64 + aantalKolommen); // A..F
  ws.mergeCells(`A1:${laatste}1`);
  const t = ws.getCell("A1");
  t.value = `${titel} — ${project.naam}`;
  t.font = { bold: true, size: 14, color: { argb: "FF00214B" } };
  ws.mergeCells(`A2:${laatste}2`);
  const s = ws.getCell("A2");
  s.value = `${project.projectnummer} · ${project.opdrachtgever} · ${labelProjectType(project.type)}${project.plaats ? " · " + project.plaats : ""}`;
  s.font = { color: { argb: "FF64748B" }, size: 10 };
}

function kopRij(ws: ExcelJS.Worksheet, rij: number, cols: string[]) {
  const hr = ws.getRow(rij);
  hr.values = cols;
  hr.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00214B" } };
    c.alignment = { vertical: "middle" };
    c.border = { bottom: { style: "thin", color: { argb: "FFE63223" } } };
  });
}

export async function mbbXlsx(project: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HANAB BMS";
  wb.created = new Date();
  const ws = wb.addWorksheet("Materiaalbestellingen");

  ws.columns = [
    { width: 44 },
    { width: 13 },
    { width: 10 },
    { width: 24 },
    { width: 15 },
    { width: 16 },
  ];

  ws.mergeCells("A1:F1");
  const t = ws.getCell("A1");
  t.value = `Materiaal Bestellingen Bestand (MBB) — ${project.naam}`;
  t.font = { bold: true, size: 14, color: { argb: "FF00214B" } };
  ws.mergeCells("A2:F2");
  const s = ws.getCell("A2");
  s.value = `${project.projectnummer} · ${project.opdrachtgever} · ${labelProjectType(project.type)}${project.plaats ? " · " + project.plaats : ""}`;
  s.font = { color: { argb: "FF64748B" }, size: 10 };

  const headerRow = 4;
  const cols = ["Artikel", "Hoeveelheid", "Eenheid", "Leverancier", "Eenheidsprijs", "Status"];
  const hr = ws.getRow(headerRow);
  hr.values = cols;
  hr.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00214B" } };
    c.alignment = { vertical: "middle" };
    c.border = { bottom: { style: "thin", color: { argb: "FFE63223" } } };
  });

  let rr = headerRow + 1;
  for (const m of project.materiaalRegels ?? []) {
    const row = ws.getRow(rr);
    row.values = [m.artikel, m.hoeveelheid, m.eenheid, m.leverancier ?? "", m.eenheidsprijs ?? null, labelMbbStatus(m.status)];
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(5).numFmt = '"€" #,##0.00';
    if ((rr - headerRow) % 2 === 0) {
      row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FA" } }));
    }
    rr++;
  }

  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: 6 } };
  ws.views = [{ state: "frozen", ySplit: headerRow }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export async function vocaXlsx(project: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HANAB BMS";
  wb.created = new Date();
  const ws = wb.addWorksheet("Voorcalculatie");
  ws.columns = [{ width: 46 }, { width: 22 }, { width: 12 }, { width: 10 }, { width: 15 }, { width: 16 }];
  kop(ws, project, "Voorcalculatie (VOCA)", 6);

  const headerRow = 4;
  kopRij(ws, headerRow, ["Omschrijving", "Categorie", "Hoeveelheid", "Eenheid", "Eenheidsprijs", "Bedrag"]);

  let rr = headerRow + 1;
  let totaal = 0;
  for (const r of project.vocaRegels ?? []) {
    const bedrag = r.hoeveelheid * r.eenheidsprijs;
    totaal += bedrag;
    const row = ws.getRow(rr);
    row.values = [r.omschrijving, labelVocaCategorie(r.categorie), r.hoeveelheid, r.eenheid, r.eenheidsprijs, bedrag];
    row.getCell(3).alignment = { horizontal: "right" };
    row.getCell(5).numFmt = '"€" #,##0.00';
    row.getCell(6).numFmt = '"€" #,##0.00';
    if ((rr - headerRow) % 2 === 0) {
      row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FA" } }));
    }
    rr++;
  }
  const tr = ws.getRow(rr);
  tr.getCell(1).value = "Totaal (excl. btw)";
  tr.getCell(6).value = totaal;
  tr.getCell(6).numFmt = '"€" #,##0.00';
  for (let c = 1; c <= 6; c++) {
    tr.getCell(c).font = { bold: true };
    tr.getCell(c).border = { top: { style: "thin", color: { argb: "FF00214B" } } };
  }

  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: 6 } };
  ws.views = [{ state: "frozen", ySplit: headerRow }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

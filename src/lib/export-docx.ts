// Word-export (.docx) van het projectdossier met de `docx`-library.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
} from "docx";
import { dossierModel, type Blok } from "./dossier-model";

const NAVY = "00214b";
const ACCENT = "e63223";
const TEKST = "0f172a";
const CONTENT_DXA = 9026;

function cel(tekst: string, breedte: number, opts: { num?: boolean; kop?: boolean; totaal?: boolean } = {}) {
  return new TableCell({
    width: { size: breedte, type: WidthType.DXA },
    shading: opts.kop ? { fill: NAVY } : opts.totaal ? { fill: "eef2f7" } : undefined,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    children: [
      new Paragraph({
        alignment: opts.num ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: tekst || "",
            bold: opts.kop || opts.totaal,
            color: opts.kop ? "ffffff" : TEKST,
            size: 17,
          }),
        ],
      }),
    ],
  });
}

function tabelBlok(b: Extract<Blok, { soort: "tabel" }>): Table {
  const som = b.kolommen.reduce((s, k) => s + k.weight, 0);
  const widths = b.kolommen.map((k) => Math.round((k.weight / som) * CONTENT_DXA));
  const rand = { style: BorderStyle.SINGLE, size: 2, color: "e2e8f0" };
  const rows: TableRow[] = [];
  rows.push(new TableRow({ tableHeader: true, children: b.kolommen.map((k, i) => cel(k.label, widths[i], { num: k.num, kop: true })) }));
  for (const r of b.rijen) {
    rows.push(new TableRow({ children: r.map((c, i) => cel(c, widths[i], { num: b.kolommen[i].num })) }));
  }
  if (b.totaal) {
    rows.push(new TableRow({ children: b.totaal.map((c, i) => cel(c, widths[i], { num: b.kolommen[i].num, totaal: true })) }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: rand, bottom: rand, left: rand, right: rand, insideHorizontal: rand, insideVertical: rand },
    rows,
  });
}

export async function dossierDocx(p: any, datum: string): Promise<Buffer> {
  const model = dossierModel(p, datum);
  const kinderen: (Paragraph | Table)[] = [];

  // Kop
  kinderen.push(
    new Paragraph({
      shading: { fill: NAVY },
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: "Hanab.", bold: true, color: "ffffff", size: 32 }), new TextRun({ text: "  BMS — Projectdossier", color: "c7d3e2", size: 20 })],
    })
  );
  kinderen.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: ACCENT } }, children: [] }));
  kinderen.push(new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: model.naam, bold: true, color: NAVY, size: 28 })] }));
  kinderen.push(new Paragraph({ children: [new TextRun({ text: `${model.projectnummer} · ${model.subtitel} · opgesteld ${model.datum}`, color: "475569", size: 18 })] }));

  for (const sectie of model.secties) {
    kinderen.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: ACCENT } },
        children: [new TextRun({ text: sectie.titel, bold: true, color: NAVY, size: 24 })],
      })
    );
    for (const b of sectie.blokken) {
      if (b.soort === "tabel") {
        kinderen.push(tabelBlok(b));
        kinderen.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      } else if (b.soort === "kop") {
        kinderen.push(new Paragraph({ spacing: { before: 120, after: 40 }, children: [new TextRun({ text: b.tekst, bold: true, color: NAVY, size: 20 })] }));
      } else {
        // tekst of pre
        const regels = b.tekst.split("\n");
        for (const r of regels) {
          kinderen.push(new Paragraph({ children: [new TextRun({ text: r, color: TEKST, size: 18 })] }));
        }
        kinderen.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      }
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children: kinderen }] });
  return await Packer.toBuffer(doc);
}

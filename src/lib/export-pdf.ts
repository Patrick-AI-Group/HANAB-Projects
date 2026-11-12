// PDF-export van het projectdossier met pdfkit (pure JS, geen browser).
import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { dossierModel, type Blok } from "./dossier-model";
import type { Kaartje } from "./kaart";
import { euro, labelVocaCategorie, onderzoekGereed } from "./domein";
import { traceCoords, traceLengteMeter } from "./opendata";

const NAVY = "#00214b";
const NAVY2 = "#00416e";
const ACCENT = "#e63223";
const GRIJS = "#e2e8f0";
const TEKST = "#0f172a";
const MUTED = "#64748b";
const CAT = ["#00416e", "#e63223", "#0f9d8c", "#f59e0b", "#6366f1", "#8b5cf6", "#0891b2", "#b45309", "#64748b"];

export interface PdfExtra {
  kaartje?: Kaartje | null;
  tekeningen?: { titel: string; svg: string }[];
}

export async function dossierPdf(p: any, datum: string, extra: PdfExtra = {}): Promise<Buffer> {
  const model = dossierModel(p, datum);
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const klaar = new Promise<void>((res) => doc.on("end", () => res()));

  const M = 40;
  const pageW = doc.page.width;
  const contentW = pageW - 2 * M;
  const bottom = doc.page.height - M;

  // Kop met HANAB-logo
  doc.rect(0, 0, pageW, 86).fill(NAVY);
  doc.rect(0, 86, pageW, 4).fill(ACCENT);
  try {
    const svg = readFileSync(path.join(process.cwd(), "public", "images", "logo-white.svg"), "utf8");
    SVGtoPDF(doc, svg, M, 26, { width: 120 });
  } catch {
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("Hanab.", M, 24);
  }
  doc.font("Helvetica").fontSize(10).fillColor("#c7d3e2").text("BMS — Projectdossier", pageW - M - 220, 28, { width: 220, align: "right" });
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffffff").text(model.naam, M, 62, { width: contentW });
  doc.y = 104;
  doc.fillColor(TEKST).font("Helvetica").fontSize(9).text(`${model.projectnummer} · ${model.subtitel} · opgesteld ${model.datum}`, M, doc.y, { width: contentW });
  doc.moveDown(1);

  const nieuwePaginaIndienNodig = (h: number) => {
    if (doc.y + h > bottom) doc.addPage();
  };

  // --- Kerncijfers (KPI-kaarten + donut + weekkolommen + voortgang) --------
  const sectieKop = (titel: string) => {
    doc.moveDown(0.3).font("Helvetica-Bold").fontSize(12.5).fillColor(NAVY).text(titel, M, doc.y, { width: contentW });
    const yy = doc.y + 2;
    doc.moveTo(M, yy).lineTo(M + contentW, yy).strokeColor(ACCENT).lineWidth(1.2).stroke();
    doc.moveDown(0.5).fillColor(TEKST);
  };

  const tekenKerncijfers = () => {
    const begroting = (p.vocaRegels ?? []).reduce((s: number, r: any) => s + r.hoeveelheid * r.eenheidsprijs, 0);
    const gereal = (p.weekproducties ?? []).reduce(
      (s: number, w: any) => s + (w.regels ?? []).reduce((a: number, r: any) => a + r.gerealiseerd * r.eenheidsprijs, 0),
      0
    );
    const termijnen = p.deelbetalingen ?? [];
    const termijnTotaal = termijnen.reduce((s: number, t: any) => s + t.bedrag, 0);
    const betaald = termijnen.filter((t: any) => t.status === "BETAALD").reduce((s: number, t: any) => s + t.bedrag, 0);
    const onderzoeken = p.onderzoeken ?? [];
    const gereed = onderzoeken.filter((o: any) => onderzoekGereed(o.status)).length;
    const coords = traceCoords(p.traceGeoJson);
    const lengte = coords.length >= 2 ? Math.round(traceLengteMeter(coords)) : null;

    sectieKop("Kerncijfers");

    // KPI-kaarten: 3 kolommen × 2 rijen
    const kpis = [
      { label: "TRACÉLENGTE", waarde: lengte ? `${lengte} m` : "—", accent: false },
      { label: "BEGROTING (VOCA)", waarde: euro(begroting), accent: true },
      { label: "GEREALISEERD", waarde: euro(gereal), accent: false },
      { label: "ONDERZOEKEN GEREED", waarde: `${gereed}/${onderzoeken.length}`, accent: false },
      { label: "MATERIAALREGELS", waarde: String((p.materiaalRegels ?? []).length), accent: false },
      { label: "WEEKSTATEN", waarde: String((p.weekproducties ?? []).length), accent: false },
    ];
    const gap = 10;
    const cardW = (contentW - 2 * gap) / 3;
    const cardH = 44;
    let cy = doc.y;
    kpis.forEach((k, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = M + col * (cardW + gap);
      const y = cy + row * (cardH + gap);
      doc.roundedRect(x, y, cardW, cardH, 6).lineWidth(0.8).strokeColor(GRIJS).stroke();
      doc.rect(x, y, 3, cardH).fill(k.accent ? ACCENT : NAVY2);
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(15).text(k.waarde, x + 12, y + 8, { width: cardW - 18, lineBreak: false });
      doc.fillColor(MUTED).font("Helvetica").fontSize(7).text(k.label, x + 12, y + 29, { width: cardW - 18, lineBreak: false });
    });
    doc.y = cy + 2 * cardH + gap + 14;
    doc.fillColor(TEKST);

    // Donut (VOCA per categorie) links + weekkolommen rechts
    const perCat = (() => {
      const m = new Map<string, number>();
      for (const r of p.vocaRegels ?? []) m.set(r.categorie, (m.get(r.categorie) ?? 0) + r.hoeveelheid * r.eenheidsprijs);
      return [...m.entries()].map(([c, v]) => ({ label: labelVocaCategorie(c), waarde: v })).sort((a, b) => b.waarde - a.waarde);
    })();
    const blokY = doc.y;
    const blokH = 150;
    nieuwePaginaIndienNodig(blokH + 10);
    const y0 = doc.y;
    const halfW = (contentW - 20) / 2;

    // Donut links
    if (begroting > 0 && perCat.length) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text("BEGROTING PER CATEGORIE", M, y0, { width: halfW });
      const cx = M + 52;
      const ccy = y0 + 78;
      const r = 42;
      const polar = (deg: number): [number, number] => {
        const a = ((deg - 90) * Math.PI) / 180;
        return [cx + r * Math.cos(a), ccy + r * Math.sin(a)];
      };
      let a0 = 0;
      perCat.forEach((d, i) => {
        const sweep = (d.waarde / begroting) * 360;
        const a1 = a0 + sweep;
        const [x0a, y0a] = polar(a0);
        const [x1a, y1a] = polar(a1);
        const large = sweep > 180 ? 1 : 0;
        doc.path(`M ${cx} ${ccy} L ${x0a} ${y0a} A ${r} ${r} 0 ${large} 1 ${x1a} ${y1a} Z`).fill(CAT[i % CAT.length]);
        a0 = a1;
      });
      doc.circle(cx, ccy, 24).fill("#ffffff");
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(8).text(`€ ${Math.round(begroting / 1000)}k`, cx - 24, ccy - 6, { width: 48, align: "center" });
      // legenda (volledig binnen de linkerhelft)
      let ly = y0 + 20;
      const lx = M + 100; // net rechts van de donut (cx+r = 92+42 = 134)
      const pctX = M + halfW - 42;
      perCat.slice(0, 7).forEach((d, i) => {
        doc.rect(lx, ly + 1, 8, 8).fill(CAT[i % CAT.length]);
        doc.fillColor(TEKST).font("Helvetica").fontSize(7).text(`${d.label}`, lx + 13, ly, { width: pctX - (lx + 13) - 4, lineBreak: false });
        doc.fillColor(MUTED).fontSize(7).text(`${Math.round((d.waarde / begroting) * 100)}%`, pctX, ly, { width: 40, align: "right", lineBreak: false });
        ly += 13;
      });
    }

    // Weekkolommen rechts
    const weken = (p.weekproducties ?? []).map((w: any) => ({
      label: `W${String(w.week).padStart(2, "0")}`,
      waarde: (w.regels ?? []).reduce((a: number, r: any) => a + r.gerealiseerd * r.eenheidsprijs, 0),
    }));
    if (weken.length) {
      const rx = M + halfW + 20;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text("PRODUCTIE PER WEEK", rx, y0, { width: halfW });
      const gTop = y0 + 22;
      const gH = 92;
      const gBase = gTop + gH;
      const maxV = Math.max(...weken.map((w: any) => w.waarde), 1);
      const stap = halfW / weken.length;
      const bw = Math.min(40, stap * 0.6);
      doc.moveTo(rx, gBase).lineTo(rx + halfW, gBase).strokeColor(GRIJS).lineWidth(0.8).stroke();
      weken.forEach((w: any, i: number) => {
        const bx = rx + stap * i + (stap - bw) / 2;
        const h = (w.waarde / maxV) * gH;
        doc.rect(bx, gBase - h, bw, h).fill(NAVY2);
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(6.5).text(`${Math.round(w.waarde / 1000)}k`, bx - 4, gBase - h - 9, { width: bw + 8, align: "center", lineBreak: false });
        doc.fillColor(MUTED).font("Helvetica").fontSize(7).text(w.label, bx - 4, gBase + 3, { width: bw + 8, align: "center", lineBreak: false });
      });
    }
    doc.y = Math.max(blokY, y0) + blokH;
    doc.fillColor(TEKST);

    // Voortgangsbalken
    const balk = (label: string, deel: number, tot: number, kleur: string) => {
      const pctN = tot > 0 ? Math.round((deel / tot) * 100) : 0;
      doc.font("Helvetica").fontSize(8.5).fillColor("#334155").text(label, M, doc.y, { width: contentW - 60, continued: false });
      const ty = doc.y;
      doc.roundedRect(M, ty, contentW, 9, 4).fill("#f1f5f9");
      if (pctN > 0) doc.roundedRect(M, ty, Math.max(6, (contentW * pctN) / 100), 9, 4).fill(kleur);
      doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(`${pctN}%`, M + contentW - 28, ty - 11, { width: 28, align: "right", lineBreak: false });
      doc.y = ty + 15;
      doc.fillColor(TEKST);
    };
    nieuwePaginaIndienNodig(70);
    balk("Uitbetaald t.o.v. termijnstaat", betaald, termijnTotaal || 1, ACCENT);
    balk("Conditionerende onderzoeken afgerond", gereed, onderzoeken.length || 1, "#0f9d8c");
    balk(
      "Materiaal geleverd",
      (p.materiaalRegels ?? []).filter((m: any) => m.status === "GELEVERD").length,
      (p.materiaalRegels ?? []).length || 1,
      NAVY2
    );
    doc.moveDown(0.6);
  };

  tekenKerncijfers();

  const tabel = (kolommen: any[], rijen: string[][], totaal?: string[]) => {
    const som = kolommen.reduce((s, k) => s + k.weight, 0);
    const widths = kolommen.map((k) => (k.weight / som) * contentW);
    const fs = 8.5;
    const pad = 4;

    const rij = (cells: string[], soort: "kop" | "totaal" | "normaal") => {
      doc.fontSize(fs).font(soort === "normaal" ? "Helvetica" : "Helvetica-Bold");
      const h =
        Math.max(
          12,
          ...cells.map((c, i) => doc.heightOfString(c || "", { width: widths[i] - 2 * pad, align: kolommen[i].num ? "right" : "left" }))
        ) +
        2 * pad;
      nieuwePaginaIndienNodig(h);
      const y = doc.y;
      if (soort === "kop") doc.rect(M, y, contentW, h).fill(NAVY);
      else if (soort === "totaal") doc.rect(M, y, contentW, h).fill("#eef2f7");
      let x = M;
      cells.forEach((c, i) => {
        doc
          .fillColor(soort === "kop" ? "#ffffff" : TEKST)
          .font(soort === "normaal" ? "Helvetica" : "Helvetica-Bold")
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
    doc.moveDown(0.7);
  };

  const blok = (b: Blok) => {
    if (b.soort === "kop") {
      nieuwePaginaIndienNodig(22);
      doc.moveDown(0.2).font("Helvetica-Bold").fontSize(10.5).fillColor(NAVY).text(b.tekst, M, doc.y, { width: contentW });
      doc.moveDown(0.2).fillColor(TEKST);
    } else if (b.soort === "tekst") {
      doc.font("Helvetica").fontSize(9.5).fillColor(TEKST).text(b.tekst, M, doc.y, { width: contentW });
      doc.moveDown(0.4);
    } else if (b.soort === "pre") {
      doc.font("Helvetica").fontSize(9).fillColor(TEKST).text(b.tekst, M, doc.y, { width: contentW });
      doc.moveDown(0.6);
    } else if (b.soort === "tabel") {
      tabel(b.kolommen, b.rijen, b.totaal);
    }
  };

  // Situatiekaart (OSM-tegels + tracé) bovenaan
  if (extra.kaartje && extra.kaartje.tiles.length) {
    const k = extra.kaartje;
    const scale = contentW / k.width;
    const mapH = k.height * scale;
    nieuwePaginaIndienNodig(mapH + 40);
    doc.moveDown(0.3).font("Helvetica-Bold").fontSize(12.5).fillColor(NAVY).text("Situatiekaart tracé", M, doc.y, { width: contentW });
    const yy = doc.y + 2;
    doc.moveTo(M, yy).lineTo(M + contentW, yy).strokeColor(ACCENT).lineWidth(1.2).stroke();
    doc.moveDown(0.4);
    const x0 = M;
    const y0 = doc.y;
    doc.save();
    doc.rect(x0, y0, contentW, mapH).clip();
    for (const t of k.tiles) {
      try {
        doc.image(t.buf, x0 + t.x * scale, y0 + t.y * scale, { width: 256 * scale, height: 256 * scale });
      } catch {
        /* tegel overslaan */
      }
    }
    // tracé
    const pts = k.tracePx.map(([x, y]) => [x0 + x * scale, y0 + y * scale] as [number, number]);
    const teken = (kleur: string, w: number, op: number) => {
      doc.save().opacity(op).lineWidth(w).strokeColor(kleur).lineJoin("round").lineCap("round");
      doc.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) doc.lineTo(pts[i][0], pts[i][1]);
      doc.stroke().restore();
    };
    teken("#ffffff", 5, 0.7);
    teken(ACCENT, 2.6, 1);
    doc.restore();
    doc.rect(x0, y0, contentW, mapH).strokeColor(GRIJS).lineWidth(0.5).stroke();
    doc.y = y0 + mapH + 6;
    doc.font("Helvetica").fontSize(8).fillColor("#64748b").text("Ingetekend tracé (rood) op OpenStreetMap-ondergrond. © OpenStreetMap-bijdragers.", M, doc.y, { width: contentW });
    doc.moveDown(0.8).fillColor(TEKST);
  }

  for (const sectie of model.secties) {
    nieuwePaginaIndienNodig(40);
    doc.moveDown(0.3).font("Helvetica-Bold").fontSize(12.5).fillColor(NAVY).text(sectie.titel, M, doc.y, { width: contentW });
    const yy = doc.y + 2;
    doc.moveTo(M, yy).lineTo(M + contentW, yy).strokeColor(ACCENT).lineWidth(1.2).stroke();
    doc.moveDown(0.5).fillColor(TEKST);
    for (const b of sectie.blokken) blok(b);
  }

  // Werktekeningen inbedden (elk op een eigen pagina)
  for (const tk of extra.tekeningen ?? []) {
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(12.5).fillColor(NAVY).text(`Werktekening — ${tk.titel}`, M, doc.y, { width: contentW });
    const yy = doc.y + 2;
    doc.moveTo(M, yy).lineTo(M + contentW, yy).strokeColor(ACCENT).lineWidth(1.2).stroke();
    doc.moveDown(0.5);
    try {
      SVGtoPDF(doc, tk.svg, M, doc.y, { width: contentW, assumePt: false });
    } catch {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("(tekening als los SVG-bestand in het dossier)", M, doc.y);
    }
  }

  // Voettekst op elke pagina (bufferedPageRange-API niet getypt in @types/pdfkit)
  try {
    const pager = doc as unknown as {
      bufferedPageRange(): { start: number; count: number };
      switchToPage(n: number): void;
      flushPages(): void;
    };
    const range = pager.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pager.switchToPage(i);
      doc.page.margins.bottom = 0; // voorkom dat de footer een extra pagina triggert
      const fy = doc.page.height - 26;
      doc.moveTo(M, fy - 6).lineTo(pageW - M, fy - 6).strokeColor(GRIJS).lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor("#64748b");
      doc.text(`HANAB BMS · ${model.projectnummer} — ${model.naam}`, M, fy, {
        width: contentW - 170,
        align: "left",
        lineBreak: false,
      });
      doc.text(`Pagina ${i - range.start + 1} van ${range.count} · opgesteld ${model.datum}`, pageW - M - 230, fy, {
        width: 230,
        align: "right",
        lineBreak: false,
      });
    }
    pager.flushPages();
  } catch {
    // voettekst is optioneel — nooit het hele dossier laten falen
  }

  doc.end();
  await klaar;
  return Buffer.concat(chunks);
}

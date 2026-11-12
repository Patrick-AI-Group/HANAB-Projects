// Gedeeld dossier-datamodel: één keer de projectdata omzetten naar secties met
// blokken (koppen, tekst, tabellen), die zowel de PDF- als de Word-renderer
// consumeren. Zo blijven beide exports consistent.

import {
  euro,
  labelProjectType,
  labelOnderzoek,
  labelOnderzoekStatus,
  labelVocaCategorie,
  labelMbbStatus,
  labelTekeningDiscipline,
  labelTekeningStatus,
  labelDeelbetalingStatus,
  labelDeelrevisieStatus,
} from "./domein";
import { aanbevolenOnderzoekRijen } from "./ai";

export interface Kolom {
  label: string;
  weight: number;
  num?: boolean;
}
export type Blok =
  | { soort: "kop"; tekst: string }
  | { soort: "tekst"; tekst: string }
  | { soort: "pre"; tekst: string }
  | { soort: "tabel"; kolommen: Kolom[]; rijen: string[][]; totaal?: string[] };

export interface DossierSectie {
  titel: string;
  blokken: Blok[];
}

export interface DossierModel {
  projectnummer: string;
  naam: string;
  subtitel: string;
  datum: string;
  secties: DossierSectie[];
}

function d(date: Date | null | undefined): string {
  return date ? new Date(date).toLocaleDateString("nl-NL") : "—";
}

export function dossierModel(p: any, datum: string): DossierModel {
  const secties: DossierSectie[] = [];

  // Bureauonderzoek
  {
    const blokken: Blok[] = [];
    let bev: any[] = [];
    try {
      bev = p.bureauonderzoek?.bevindingenJson ? JSON.parse(p.bureauonderzoek.bevindingenJson) : [];
    } catch {
      bev = [];
    }
    if (bev.length) {
      blokken.push({
        soort: "tabel",
        kolommen: [
          { label: "Thema", weight: 2 },
          { label: "Bron", weight: 2.4 },
          { label: "Status", weight: 1.1 },
          { label: "Aantal", weight: 0.9, num: true },
          { label: "Bevinding", weight: 4.5 },
        ],
        rijen: bev.map((b) => [
          String(b.thema ?? ""),
          String(b.bron ?? ""),
          b.beschikbaar ? "live" : "handmatig",
          typeof b.aantal === "number" ? String(b.aantal) : "—",
          String(b.samenvatting ?? ""),
        ]),
      });
    }
    if (p.bureauonderzoek?.rapport) blokken.push({ soort: "pre", tekst: p.bureauonderzoek.rapport });
    if (bev.length) {
      blokken.push({ soort: "kop", tekst: "Aanbevolen vervolgonderzoek" });
      blokken.push({
        soort: "tabel",
        kolommen: [
          { label: "Onderzoek", weight: 4 },
          { label: "Noodzaak", weight: 2.2 },
          { label: "Doorlooptijd", weight: 1.6 },
          { label: "Verantwoordelijke", weight: 2.4 },
        ],
        rijen: aanbevolenOnderzoekRijen({ type: p.type, omschrijving: p.omschrijving }, bev),
      });
    }
    if (blokken.length) secties.push({ titel: "Bureauonderzoek conditionerende onderzoeken", blokken });
  }

  // Conditionerende onderzoeken
  if ((p.onderzoeken ?? []).length) {
    secties.push({
      titel: "Conditionerende onderzoeken",
      blokken: [
        {
          soort: "tabel",
          kolommen: [
            { label: "Onderzoek", weight: 3 },
            { label: "Type", weight: 3 },
            { label: "Uitvoerder", weight: 2 },
            { label: "Status", weight: 1.6 },
            { label: "Verplicht", weight: 1 },
          ],
          rijen: p.onderzoeken.map((o: any) => [
            o.titel ?? labelOnderzoek(o.type),
            labelOnderzoek(o.type),
            o.uitvoerder ?? "—",
            labelOnderzoekStatus(o.status),
            o.verplicht ? "ja" : "nee",
          ]),
        },
      ],
    });
  }

  // Voorcalculatie
  if ((p.vocaRegels ?? []).length) {
    const totaal = p.vocaRegels.reduce((s: number, r: any) => s + r.hoeveelheid * r.eenheidsprijs, 0);
    secties.push({
      titel: "Voorcalculatie (VOCA)",
      blokken: [
        {
          soort: "tabel",
          kolommen: [
            { label: "Omschrijving", weight: 4 },
            { label: "Categorie", weight: 2 },
            { label: "Hoev.", weight: 1, num: true },
            { label: "Eenh.", weight: 0.9 },
            { label: "Prijs/eenh.", weight: 1.4, num: true },
            { label: "Bedrag", weight: 1.6, num: true },
          ],
          rijen: p.vocaRegels.map((r: any) => [
            r.omschrijving,
            labelVocaCategorie(r.categorie),
            String(r.hoeveelheid),
            r.eenheid,
            euro(r.eenheidsprijs),
            euro(r.hoeveelheid * r.eenheidsprijs),
          ]),
          totaal: ["Totaal (excl. btw)", "", "", "", "", euro(totaal)],
        },
      ],
    });
  }

  // MBB
  if ((p.materiaalRegels ?? []).length) {
    secties.push({
      titel: "Materiaal Bestellingen Bestand (MBB)",
      blokken: [
        {
          soort: "tabel",
          kolommen: [
            { label: "Artikel", weight: 4 },
            { label: "Hoev.", weight: 1, num: true },
            { label: "Eenh.", weight: 0.9 },
            { label: "Leverancier", weight: 2 },
            { label: "Status", weight: 1.4 },
          ],
          rijen: p.materiaalRegels.map((m: any) => [
            m.artikel,
            String(m.hoeveelheid),
            m.eenheid,
            m.leverancier ?? "—",
            labelMbbStatus(m.status),
          ]),
        },
      ],
    });
  }

  // Werktekeningen
  if ((p.werktekeningen ?? []).length) {
    secties.push({
      titel: "Werktekeningenregister",
      blokken: [
        {
          soort: "tabel",
          kolommen: [
            { label: "Tek.nr", weight: 1.6 },
            { label: "Titel", weight: 4 },
            { label: "Discipline", weight: 1.8 },
            { label: "Versie", weight: 0.9 },
            { label: "Status", weight: 1.4 },
          ],
          rijen: p.werktekeningen.map((t: any) => [
            t.tekeningnummer ?? "—",
            t.titel,
            labelTekeningDiscipline(t.discipline),
            t.versie,
            labelTekeningStatus(t.status),
          ]),
        },
      ],
    });
  }

  // Weekstaten
  if ((p.weekproducties ?? []).length) {
    const blokken: Blok[] = [];
    let totaal = 0;
    for (const w of p.weekproducties) {
      const wt = (w.regels ?? []).reduce((s: number, r: any) => s + r.gerealiseerd * r.eenheidsprijs, 0);
      totaal += wt;
      blokken.push({ soort: "kop", tekst: `Week ${w.jaar}-W${String(w.week).padStart(2, "0")} (${w.status}) — ${euro(wt)}` });
      blokken.push({
        soort: "tabel",
        kolommen: [
          { label: "Post", weight: 4 },
          { label: "Gepland", weight: 1.1, num: true },
          { label: "Gerealiseerd", weight: 1.4, num: true },
          { label: "Eenh.", weight: 0.9 },
          { label: "Prijs", weight: 1.3, num: true },
          { label: "Productie", weight: 1.5, num: true },
        ],
        rijen: (w.regels ?? []).map((r: any) => [
          r.omschrijving,
          String(r.gepland),
          String(r.gerealiseerd),
          r.eenheid,
          euro(r.eenheidsprijs),
          euro(r.gerealiseerd * r.eenheidsprijs),
        ]),
      });
    }
    blokken.push({ soort: "tekst", tekst: `Totaal gerealiseerde productie: ${euro(totaal)}` });
    secties.push({ titel: "Weekstaten", blokken });
  }

  // Termijnstaat
  if ((p.deelbetalingen ?? []).length) {
    const totaal = p.deelbetalingen.reduce((s: number, x: any) => s + x.bedrag, 0);
    secties.push({
      titel: "Termijnstaat (deelbetalingen)",
      blokken: [
        {
          soort: "tabel",
          kolommen: [
            { label: "Termijn", weight: 1.1 },
            { label: "Datum", weight: 1.4 },
            { label: "Omschrijving", weight: 4 },
            { label: "Bedrag", weight: 1.6, num: true },
            { label: "Status", weight: 1.4 },
          ],
          rijen: p.deelbetalingen.map((x: any) => [
            `T${x.termijn}`,
            d(x.datum),
            x.omschrijving ?? "—",
            euro(x.bedrag),
            labelDeelbetalingStatus(x.status),
          ]),
          totaal: ["Totaal", "", "", euro(totaal), ""],
        },
      ],
    });
  }

  // Deelrevisies
  if ((p.deelrevisies ?? []).length) {
    secties.push({
      titel: "Deelrevisies (as-built)",
      blokken: [
        {
          soort: "tabel",
          kolommen: [
            { label: "Deel", weight: 2 },
            { label: "Omschrijving", weight: 5 },
            { label: "Status", weight: 1.6 },
          ],
          rijen: p.deelrevisies.map((r: any) => [r.deel, r.omschrijving ?? "—", labelDeelrevisieStatus(r.status)]),
        },
      ],
    });
  }

  return {
    projectnummer: p.projectnummer,
    naam: p.naam,
    subtitel: `${p.opdrachtgever} · ${labelProjectType(p.type)}${p.plaats ? " · " + p.plaats : ""}`,
    datum,
    secties,
  };
}

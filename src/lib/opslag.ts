// Opslaglaag voor dossierbestanden. Server-only.
//
// Op Vercel (read-only filesystem) schrijven we naar Vercel Blob; de aanwezige
// BLOB_READ_WRITE_TOKEN bepaalt dat. Lokaal (geen token) schrijven we gewoon
// naar public/docs, zodat dev zonder Blob-configuratie blijft werken.
//
// Een `key` is een pad zonder leidende slash, bv. "docs/HNB-2026-003/foo.html".
// De functie levert een publieke URL terug (absolute Blob-URL op Vercel, of
// een relatieve /docs/...-URL lokaal) die rechtstreeks als href bruikbaar is.

import { promises as fs } from "fs";
import path from "path";

const gebruiktBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

export function blobActief(): boolean {
  return gebruiktBlob;
}

export async function bewaarBestand(
  key: string,
  data: string | Buffer,
  contentType?: string
): Promise<string> {
  const schone = key.replace(/^\/+/, "");

  if (gebruiktBlob) {
    const { put } = await import("@vercel/blob");
    const res = await put(schone, data, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.url;
  }

  // Lokale terugval: schrijf onder /public zodat Next het statisch serveert.
  const full = path.join(process.cwd(), "public", schone);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return "/" + schone;
}

/** Contenttype op basis van bestandsextensie. */
export function contentTypeVoor(naam: string): string {
  const ext = naam.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "html":
      return "text/html; charset=utf-8";
    case "csv":
      return "text/csv; charset=utf-8";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

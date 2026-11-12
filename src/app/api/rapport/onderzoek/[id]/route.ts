import { prisma } from "@/lib/db";
import { streamOnderzoekRapport, lokaalOnderzoekRapportTekst, heeftClaudeSleutel } from "@/lib/ai";
import { traceCoords, traceLengteMeter } from "@/lib/opendata";
import { labelOnderzoek } from "@/lib/domein";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Streamt een AI-onderzoeksrapport als platte tekst (voor live weergave) en
// bewaart het resultaat in de database — bewust GEEN filesystem, zodat het ook
// op Vercel (read-only FS, zonder Blob-config) werkt. Het rapport is daarna te
// bekijken via /api/rapport/onderzoek/[id]/view.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const onderzoek = await prisma.conditionerendOnderzoek.findUnique({ where: { id: params.id } });
  if (!onderzoek) return new Response("Onderzoek niet gevonden", { status: 404 });

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: onderzoek.projectId },
    include: { bureauonderzoek: true },
  });

  let bevindingen: any[] = [];
  try {
    bevindingen = project.bureauonderzoek?.bevindingenJson
      ? JSON.parse(project.bureauonderzoek.bevindingenJson)
      : [];
  } catch {
    bevindingen = [];
  }
  const coords = traceCoords(project.traceGeoJson);
  const lengte = coords.length >= 2 ? traceLengteMeter(coords) : undefined;
  const ctx = {
    naam: project.naam,
    type: project.type,
    plaats: project.plaats,
    omschrijving: project.omschrijving,
    opdrachtgever: project.opdrachtgever,
  };

  const encoder = new TextEncoder();
  const heeftSleutel = await heeftClaudeSleutel();
  const viewPad = `/api/rapport/onderzoek/${onderzoek.id}/view`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let volledig = "";
      let bron: "claude" | "lokaal" = "lokaal";
      try {
        if (heeftSleutel) {
          try {
            for await (const chunk of streamOnderzoekRapport(ctx, onderzoek, bevindingen, lengte)) {
              volledig += chunk;
              controller.enqueue(encoder.encode(chunk));
            }
            if (volledig.trim()) bron = "claude";
          } catch (e) {
            console.error("Streaming onderzoeksrapport via Claude mislukt, val terug op lokaal:", e);
          }
        }
        if (!volledig.trim()) {
          volledig = lokaalOnderzoekRapportTekst(ctx, onderzoek, bevindingen, lengte);
          bron = "lokaal";
          controller.enqueue(encoder.encode(volledig));
        }
      } finally {
        try {
          await prisma.conditionerendOnderzoek.update({
            where: { id: onderzoek.id },
            data: { rapport: volledig, rapportBron: bron, rapportPad: viewPad },
          });
          await prisma.document.deleteMany({
            where: { onderzoekId: onderzoek.id, categorie: "ONDERZOEKSRAPPORT" },
          });
          await prisma.document.create({
            data: {
              projectId: project.id,
              onderzoekId: onderzoek.id,
              naam: `Onderzoeksrapport — ${labelOnderzoek(onderzoek.type)}`,
              categorie: "ONDERZOEKSRAPPORT",
              pad: viewPad,
            },
          });
          await prisma.activiteit.create({
            data: {
              projectId: project.id,
              type: "AI",
              bericht: `Onderzoeksrapport gegenereerd (${bron === "claude" ? "Claude" : "lokale regels"}): ${labelOnderzoek(onderzoek.type)}.`,
            },
          });
        } catch (e) {
          console.error("Opslaan onderzoeksrapport mislukt:", e);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

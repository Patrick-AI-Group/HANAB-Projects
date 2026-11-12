import { prisma } from "@/lib/db";
import { onderzoekRapportHtml } from "@/lib/documenten";
import { traceCoords, traceLengteMeter } from "@/lib/opendata";

export const dynamic = "force-dynamic";

// Serveert het opgeslagen onderzoeksrapport als opgemaakte HTML, rechtstreeks
// uit de database (geen filesystem nodig — werkt dus ook op Vercel).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const onderzoek = await prisma.conditionerendOnderzoek.findUnique({ where: { id: params.id } });
  if (!onderzoek?.rapport) return new Response("Geen rapport beschikbaar", { status: 404 });

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
  const lengteM = coords.length >= 2 ? traceLengteMeter(coords) : undefined;
  const datum = new Date().toLocaleDateString("nl-NL");
  const html = onderzoekRapportHtml(project, onderzoek, onderzoek.rapport, datum, { bevindingen, lengteM });

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

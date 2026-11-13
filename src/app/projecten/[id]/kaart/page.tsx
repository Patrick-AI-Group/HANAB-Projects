import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { MapTrace } from "@/components/MapTrace";
import { snapTraceAanDeWeg } from "@/app/actions";
import { traceCoords, traceLengteMeter } from "@/lib/opendata";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ProjectKaart({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
  });
  if (!project) notFound();

  const coords = traceCoords(project.traceGeoJson);
  const lengte = coords.length >= 2 ? traceLengteMeter(coords) : 0;
  const heeftTrace = coords.length >= 2;

  return (
    <div className="space-y-6">
      {/* Kaart + tracé */}
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Tracé intekenen</h2>
            <p className="text-xs text-slate-500">
              Teken het tracé op de kaart.
            </p>
          </div>
          {heeftTrace && (
            <div className="flex items-center gap-2">
              <span className="badge bg-emerald-100 text-emerald-800 ring-emerald-200">
                tracé opgeslagen · {lengte} m
              </span>
              <form action={snapTraceAanDeWeg}>
                <input type="hidden" name="projectId" value={project.id} />
                <button className="btn-ghost px-3 py-1.5 text-xs" type="submit" title="Leg het tracé op de dichtstbijzijnde wegroute (berm)">
                  🛣️ Op de weg leggen
                </button>
              </form>
            </div>
          )}
        </div>
        <MapTrace projectId={project.id} initialTrace={project.traceGeoJson} />
      </div>
    </div>
  );
}

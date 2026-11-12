import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { mbbXlsx } from "@/lib/export-xlsx";
import { mbbPdf } from "@/lib/export-tabelpdf";

export const dynamic = "force-dynamic";

// Exporteert het materiaalbestellingenbestand als PDF of Excel.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { materiaalRegels: { orderBy: { createdAt: "asc" } } },
  });
  if (!project) return new Response("Project niet gevonden", { status: 404 });

  const veilig = project.projectnummer.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === "xlsx") {
    const buf = await mbbXlsx(project);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="MBB-${veilig}.xlsx"`,
      },
    });
  }

  const buf = await mbbPdf(project);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="MBB-${veilig}.pdf"`,
    },
  });
}

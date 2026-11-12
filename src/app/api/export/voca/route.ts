import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Exporteert de voorcalculatie (VOCA) als PDF of Excel.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { vocaRegels: { orderBy: { createdAt: "asc" } } },
  });
  if (!project) return new Response("Project niet gevonden", { status: 404 });

  const veilig = project.projectnummer.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === "xlsx") {
    const { vocaXlsx } = await import("@/lib/export-xlsx");
    const buf = await vocaXlsx(project);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="VOCA-${veilig}.xlsx"`,
      },
    });
  }

  const { vocaPdf } = await import("@/lib/export-tabelpdf");
  const buf = await vocaPdf(project);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="VOCA-${veilig}.pdf"`,
    },
  });
}

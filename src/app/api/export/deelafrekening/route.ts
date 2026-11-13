import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Exporteert de deelafrekenstaat (termijnafrekening) van één deelbetaling als PDF of Excel.
export async function GET(req: NextRequest) {
  const deelbetalingId = req.nextUrl.searchParams.get("deelbetalingId") ?? "";
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";

  const deelbetaling = await prisma.deelbetaling.findUnique({
    where: { id: deelbetalingId },
    include: {
      project: {
        include: {
          weekproducties: { include: { regels: true } },
          deelbetalingen: true,
        },
      },
    },
  });
  if (!deelbetaling) return new Response("Deelbetaling niet gevonden", { status: 404 });

  const veilig = `${deelbetaling.project.projectnummer}-T${deelbetaling.termijn}`.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === "xlsx") {
    const { deelafrekeningXlsx } = await import("@/lib/export-xlsx");
    const buf = await deelafrekeningXlsx(deelbetaling);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Deelafrekenstaat-${veilig}.xlsx"`,
      },
    });
  }

  const { deelafrekeningPdf } = await import("@/lib/export-tabelpdf");
  const buf = await deelafrekeningPdf(deelbetaling);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Deelafrekenstaat-${veilig}.pdf"`,
    },
  });
}

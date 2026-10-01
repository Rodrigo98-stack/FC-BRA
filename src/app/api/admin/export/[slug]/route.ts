import { getAuth } from "@/server/auth/session";
import { getReport } from "@/server/services/reports";
import { exportCell, loadReport, reportAccess } from "@/server/report-view";
import { toCsv, toXlsx } from "@/server/export";
import { getBrands } from "@/server/services/brands";
import { write } from "@/server/db";
import { audit } from "@/server/audit";
import { cookies } from "next/headers";
import { ADMIN_BRAND_COOKIE } from "@/server/admin";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await getAuth();
  if (!auth) return new Response("Sessão expirada.", { status: 401 });
  const { slug } = await params;
  const def = getReport(slug);
  if (!def) return new Response("Relatório não encontrado.", { status: 404 });
  if (!reportAccess(auth, def).export) return new Response("Sem permissão para exportar.", { status: 403 });
  const url = new URL(req.url);
  const q = Object.fromEntries(url.searchParams.entries());
  const selected = (await cookies()).get(ADMIN_BRAND_COOKIE)?.value ?? null;
  const report = await loadReport(auth, slug, q, { all: true, selectedBrandId: selected });
  if (!report) return new Response("Relatório não encontrado.", { status: 404 });
  const brands = new Map((await getBrands()).map((b) => [b.id, b]));
  const headers = def.columns.map((c) => c.label);
  const rows = report.rows.map((r) => def.columns.map((c) => exportCell(c, r[c.key], brands)));
  const stamp = new Date().toISOString().slice(0, 10);
  const format = q.formato === "xlsx" ? "xlsx" : "csv";
  await write(
    (tx) =>
      audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
        action: "relatorio.exportar",
        entity: "reports",
        entityId: slug,
        after: { formato: format, registros: rows.length },
      }),
    { persist: false },
  );
  if (format === "xlsx") {
    return new Response(new Uint8Array(toXlsx(def.title, headers, rows)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="relatorio-${slug}-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${slug}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

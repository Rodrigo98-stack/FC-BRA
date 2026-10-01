import { notFound } from "next/navigation";
import { getAdminContext } from "@/server/admin";
import { getReport } from "@/server/services/reports";
import { formatCell, loadReport, reportAccess } from "@/server/report-view";
import { formatDateTime } from "@/lib/format";
import { PrintOnLoad } from "./print";

export const metadata = { title: "Impressão de relatório" };

/** Versão para impressão / salvar como PDF (sem o menu do painel). */
export default async function PrintReport({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const def = getReport(slug);
  if (!def) notFound();
  const ctx = await getAdminContext();
  if (!reportAccess(ctx.auth, def).export) notFound();
  const sp = await searchParams;
  const report = await loadReport(ctx.auth, slug, sp, { all: true, selectedBrandId: ctx.selectedBrandId });
  if (!report) notFound();
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  const brandLabel = report.brandId ? brands.get(report.brandId)?.name : "Todas as marcas";
  return (
    <main className="mx-auto max-w-[1100px] bg-white p-8 text-[11px] text-stone-900">
      <PrintOnLoad />
      <header className="mb-6 flex items-end justify-between border-b border-stone-300 pb-3">
        <div>
          <p className="text-[10px] tracking-[0.16em] text-stone-500">FINA CLÁSSICA + BRAVUS</p>
          <h1 className="text-xl font-semibold">Relatório: {def.title}</h1>
          <p className="text-stone-600">
            {brandLabel}
            {def.filters.includes("period") && ` · ${report.period.label} (${report.period.fromDate.split("-").reverse().join("/")} a ${report.period.toDate.split("-").reverse().join("/")})`}
          </p>
        </div>
        <p className="text-right text-stone-500">
          Gerado em {formatDateTime(new Date())}
          <br />
          por {ctx.auth.user.fullName} · {report.total} registro(s)
        </p>
      </header>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {def.columns.map((c) => (
              <th key={c.key} className={`border-b border-stone-400 px-1.5 py-1 text-left font-semibold ${["money", "number", "percent"].includes(c.type ?? "") ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, i) => (
            <tr key={i} className="break-inside-avoid">
              {def.columns.map((c) => (
                <td key={c.key} className={`border-b border-stone-200 px-1.5 py-1 ${["money", "number", "percent"].includes(c.type ?? "") ? "text-right tabular-nums" : ""}`}>
                  {formatCell(c, row[c.key], brands)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

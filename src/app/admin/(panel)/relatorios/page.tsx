import Link from "next/link";
import { guard } from "@/server/admin";
import { REPORTS } from "@/server/services/reports";
import { reportAccess } from "@/server/report-view";
import { MODULE_LABELS } from "@/lib/domain";
import { EmptyState, Forbidden, PageHeader, Panel } from "@/components/admin/ui";

export const metadata = { title: "Relatórios" };

export default async function ReportsIndex() {
  const ctx = await guard("relatorios");
  if (!ctx.allowed) return <Forbidden module="Relatórios" />;
  const available = REPORTS.filter((r) => reportAccess(ctx.auth, r).view);
  return (
    <div>
      <PageHeader title="Relatórios" description="Filtros por marca, categoria, período e status. Exportação em CSV, Excel e PDF (impressão)." />
      {available.length ? (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-stone-100">
            {available.map((r) => (
              <li key={r.slug}>
                <Link href={`/admin/relatorios/${r.slug}`} className="flex items-center justify-between gap-6 px-5 py-4 hover:bg-stone-50">
                  <span>
                    <span className="block text-[15px] font-medium text-stone-900">{r.title}</span>
                    <span className="block text-sm text-stone-500">{r.description}</span>
                  </span>
                  <span className="shrink-0 text-xs text-stone-400">{MODULE_LABELS[r.module]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel>
          <EmptyState title="Nenhum relatório disponível para o seu papel" />
        </Panel>
      )}
    </div>
  );
}

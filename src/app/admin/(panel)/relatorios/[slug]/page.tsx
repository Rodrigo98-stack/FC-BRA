import { notFound } from "next/navigation";
import { guard } from "@/server/admin";
import { formOptions } from "@/server/resources";
import { getReport } from "@/server/services/reports";
import { formatCell, loadReport, reportAccess } from "@/server/report-view";
import { PERIOD_KEYS, PERIOD_LABELS } from "@/lib/period";
import {
  AdminPagination,
  EmptyState,
  FilterBar,
  FilterSelect,
  Forbidden,
  hrefWith,
  LinkButton,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { ORDER_STATUS_LABELS } from "@/lib/domain";

export const metadata = { title: "Relatório" };

type SP = Record<string, string | undefined>;

export default async function ReportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const def = getReport(slug);
  if (!def) notFound();
  const ctx = await guard("relatorios");
  const access = reportAccess(ctx.auth, def);
  if (!access.view) return <Forbidden module={`Relatório: ${def.title}`} />;
  const sp = await searchParams;
  const [report, options] = await Promise.all([loadReport(ctx.auth, slug, sp, { selectedBrandId: ctx.selectedBrandId }), formOptions(ctx.auth, def.module)]);
  if (!report) notFound();
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  const qs = new URLSearchParams(Object.entries({ ...sp, marca: sp.marca ?? report.brandId ?? undefined }).filter(([k, v]) => v && k !== "pagina") as [string, string][]).toString();
  const statusOptions = def.statusOptions ?? (def.filters.includes("status") ? ORDER_STATUS_LABELS : {});

  return (
    <div className="space-y-6">
      <PageHeader
        title={def.title}
        description={def.description}
        crumbs={[{ href: "/admin/relatorios", label: "Relatórios" }, { label: def.title }]}
        actions={
          access.export ? (
            <>
              <LinkButton href={`/api/admin/export/${slug}?${qs}&formato=csv`}>CSV</LinkButton>
              <LinkButton href={`/api/admin/export/${slug}?${qs}&formato=xlsx`}>Excel</LinkButton>
              <LinkButton href={`/admin/relatorios-impressao/${slug}?${qs}`} variant="primary">
                PDF / imprimir
              </LinkButton>
            </>
          ) : null
        }
      />
      <Panel bodyClassName="p-0">
        <FilterBar>
          {def.filters.includes("period") && (
            <>
              <FilterSelect
                name="periodo"
                label="Período"
                value={report.period.key}
                allLabel="Últimos 30 dias"
                options={PERIOD_KEYS.map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
              />
              <label className="flex flex-col gap-1 text-xs text-stone-500">
                De (personalizado)
                <input type="date" name="de" defaultValue={sp.de ?? ""} className="admin-input py-1.5" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-stone-500">
                Até
                <input type="date" name="ate" defaultValue={sp.ate ?? ""} className="admin-input py-1.5" />
              </label>
            </>
          )}
          {def.filters.includes("brand") && ctx.visibleBrands.length > 1 && (
            <FilterSelect name="marca" label="Marca" value={report.brandId} allLabel="Todas" options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))} />
          )}
          {def.filters.includes("category") && (
            <FilterSelect
              name="categoria"
              label="Categoria"
              value={sp.categoria}
              allLabel="Todas"
              options={options.categories
                .filter((c) => c.kind === "padrao" && (!report.brandId || c.brandId === report.brandId))
                .map((c) => ({ value: c.id, label: `${c.name}${report.brandId ? "" : ` · ${brands.get(c.brandId)?.name ?? ""}`}` }))}
            />
          )}
          {def.filters.includes("status") && <FilterSelect name="status" label="Status" value={sp.status} options={statusOptions} />}
        </FilterBar>
        {def.filters.includes("period") && <p className="px-4 pt-2 text-xs text-stone-500">Período: {report.period.label}</p>}
        {report.rows.length === 0 ? (
          <EmptyState title="Sem dados para os filtros escolhidos" />
        ) : (
          <Table>
            <thead>
              <tr>
                {def.columns.map((c) => (
                  <Th key={c.key} align={["money", "number", "percent"].includes(c.type ?? "") ? "right" : undefined}>
                    {c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, i) => (
                <tr key={i}>
                  {def.columns.map((c) => (
                    <Td key={c.key} align={["money", "number", "percent"].includes(c.type ?? "") ? "right" : undefined}>
                      {formatCell(c, row[c.key], brands)}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <AdminPagination page={report.page} pages={report.pages} total={report.total} makeHref={(p) => hrefWith(`/admin/relatorios/${slug}`, sp, { pagina: p })} />
      </Panel>
    </div>
  );
}

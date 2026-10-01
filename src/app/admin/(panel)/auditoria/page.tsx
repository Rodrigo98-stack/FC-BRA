import Link from "next/link";
import { guard } from "@/server/admin";
import { listAuditLogs } from "@/server/services/audit-query";
import { listTeam } from "@/server/services/users";
import { resolvePeriod, PERIOD_KEYS, PERIOD_LABELS } from "@/lib/period";
import { formatDateTime } from "@/lib/format";
import { auditActionLabel } from "@/lib/audit-labels";
import {
  AdminPagination,
  EmptyState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Forbidden,
  hrefWith,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";

export const metadata = { title: "Logs de auditoria" };

type SP = Record<string, string | undefined>;

const ENTITY_LINK: Record<string, string> = {
  orders: "/admin/pedidos/",
  products: "/admin/produtos/",
  users: "/admin/equipe/",
  roles: "/admin/permissoes/",
  customers: "/admin/clientes/",
};

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-stone-400">—</span>;
  return <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-stone-50 p-2 text-[11px] text-stone-700">{JSON.stringify(value, null, 2)}</pre>;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("auditoria");
  if (!ctx.allowed) return <Forbidden module="Logs de auditoria" />;
  const sp = await searchParams;
  const [list, people] = await Promise.all([
    listAuditLogs({
      scope: ctx.scope,
      brandId: sp.marca ?? null,
      userId: sp.usuario && /^[0-9a-f-]{36}$/.test(sp.usuario) ? sp.usuario : null,
      entity: sp.entidade ?? null,
      q: sp.q ?? null,
      period: sp.periodo ? resolvePeriod(sp.periodo) : null,
      page: Number(sp.pagina ?? 1) || 1,
    }),
    listTeam({}),
  ]);
  const brands = new Map(ctx.brands.map((b) => [b.id, b.name]));
  return (
    <div>
      <PageHeader title="Logs de auditoria" description="Toda ação administrativa: quem, o quê, quando, antes/depois e motivo. Os registros não podem ser editados." />
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSearch value={sp.q} placeholder="Ação, pessoa, motivo ou ID" />
          <FilterSelect name="usuario" label="Pessoa" value={sp.usuario} allLabel="Todas" options={people.map((p) => ({ value: p.id, label: p.fullName }))} />
          <FilterSelect name="entidade" label="Área" value={sp.entidade} allLabel="Todas" options={list.entities.map((e) => ({ value: e, label: e }))} />
          {ctx.visibleBrands.length > 1 && (
            <FilterSelect name="marca" label="Marca" value={sp.marca} allLabel="Todas" options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))} />
          )}
          <FilterSelect
            name="periodo"
            label="Período"
            value={sp.periodo}
            allLabel="Todo o período"
            options={PERIOD_KEYS.filter((k) => k !== "personalizado").map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
          />
        </FilterBar>
        {list.rows.length === 0 ? (
          <EmptyState title="Nenhum registro encontrado" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Quem</Th>
                <Th>O quê</Th>
                <Th>Marca</Th>
                <Th>Detalhes</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</Td>
                  <Td>
                    {r.actor_user_id ? (
                      <Link href={`/admin/equipe/${r.actor_user_id}`} className="hover:underline">
                        {r.actor_name}
                      </Link>
                    ) : (
                      (r.actor_name ?? "Sistema")
                    )}
                    {r.ip && <span className="block text-[11px] text-stone-400">IP {r.ip}</span>}
                  </Td>
                  <Td>
                    {auditActionLabel(r.action)}
                    <span className="block text-[11px] text-stone-500">
                      {r.entity}
                      {r.entity_id && ENTITY_LINK[r.entity] ? (
                        <>
                          {" · "}
                          <Link className="underline" href={`${ENTITY_LINK[r.entity]}${r.entity_id}`}>
                            abrir
                          </Link>
                        </>
                      ) : null}
                    </span>
                    {r.reason && <span className="mt-1 block text-xs text-stone-700">Motivo: {r.reason}</span>}
                  </Td>
                  <Td className="text-xs">{r.brand_id ? brands.get(r.brand_id) : "—"}</Td>
                  <Td className="w-[38%]">
                    {(r.before !== null || r.after !== null) && (
                      <details>
                        <summary className="cursor-pointer text-xs text-stone-600">Antes / depois</summary>
                        <div className="mt-2 grid gap-2 lg:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[11px] font-medium text-stone-500">Antes</p>
                            <Json value={r.before} />
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-medium text-stone-500">Depois</p>
                            <Json value={r.after} />
                          </div>
                        </div>
                      </details>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <AdminPagination page={list.page} pages={list.pages} total={list.total} makeHref={(p) => hrefWith("/admin/auditoria", sp, { pagina: p })} />
      </Panel>
    </div>
  );
}

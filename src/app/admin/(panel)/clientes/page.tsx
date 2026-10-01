import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { listCustomers } from "@/server/services/customers";
import { formatBRL } from "@/lib/format";
import { formatPhone } from "@/lib/text";
import {
  AdminPagination,
  Badge,
  CellDate,
  DemoBadge,
  EmptyState,
  FilterBar,
  FilterSearch,
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

export const metadata = { title: "Clientes" };

type SP = Record<string, string | undefined>;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("clientes");
  if (!ctx.allowed) return <Forbidden module="Clientes" />;
  const sp = await searchParams;
  const brandId = sp.marca ?? ctx.selectedBrandId;
  const list = await listCustomers({
    scope: ctx.scope,
    brandId,
    q: sp.q ?? null,
    sort: (["recentes", "valor", "compras", "nome"] as const).find((s) => s === sp.ordem) ?? "recentes",
    page: Number(sp.pagina ?? 1) || 1,
  });
  return (
    <div>
      <PageHeader
        title="Clientes"
        description="CRM: histórico, valor comprado, quantidade de compras, última compra, ticket médio e marca preferida (métricas da marca selecionada)."
        actions={
          <>
            {can(ctx.auth.perms, "relatorios", "visualizar") && <LinkButton href="/admin/relatorios/clientes">Exportar</LinkButton>}
            {can(ctx.auth.perms, "clientes", "criar") && (
              <LinkButton href="/admin/clientes/novo" variant="primary">
                Novo cliente
              </LinkButton>
            )}
          </>
        }
      />
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSearch value={sp.q} placeholder="Nome, telefone, e-mail ou cidade" />
          {ctx.visibleBrands.length > 1 && (
            <FilterSelect name="marca" label="Marca" value={brandId} allLabel="Todas" options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))} />
          )}
          <FilterSelect
            name="ordem"
            label="Ordenar"
            value={sp.ordem}
            allLabel="Atividade recente"
            options={{ valor: "Maior valor comprado", compras: "Mais compras", nome: "Nome" }}
          />
        </FilterBar>
        {list.rows.length === 0 ? (
          <EmptyState title="Nenhum cliente encontrado" text="Clientes são cadastrados automaticamente a cada pedido." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Cidade</Th>
                <Th align="right">Compras</Th>
                <Th align="right">Valor total</Th>
                <Th align="right">Ticket médio</Th>
                <Th>Última compra</Th>
                <Th>Marca preferida</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((c) => (
                <tr key={c.id} className="hover:bg-stone-50/60">
                  <Td>
                    <span className="flex items-center gap-2">
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-stone-900 hover:underline">
                        {c.name}
                      </Link>
                      <DemoBadge show={c.is_demo} />
                      {c.whatsapp_opt_in && <Badge tone="success">opt-in</Badge>}
                    </span>
                    <span className="text-xs text-stone-500">{formatPhone(c.phone)}</span>
                  </Td>
                  <Td>{[c.city, c.state].filter(Boolean).join("/") || <span className="text-stone-400">—</span>}</Td>
                  <Td align="right">{c.orders_count}</Td>
                  <Td align="right">{formatBRL(c.total_spent)}</Td>
                  <Td align="right">{c.avg_ticket === null ? "—" : formatBRL(c.avg_ticket)}</Td>
                  <Td>{c.last_purchase ? <CellDate value={c.last_purchase} /> : <span className="text-stone-400">—</span>}</Td>
                  <Td>{c.preferred_brand ?? <span className="text-stone-400">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <AdminPagination page={list.page} pages={list.pages} total={list.total} makeHref={(p) => hrefWith("/admin/clientes", sp, { pagina: p })} />
      </Panel>
    </div>
  );
}

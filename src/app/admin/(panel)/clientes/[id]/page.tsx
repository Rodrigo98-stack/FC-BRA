import Link from "next/link";
import { notFound } from "next/navigation";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { getCustomerDetail } from "@/server/services/customers";
import { deleteResourceAction } from "../../resource-actions";
import { formatBRL, formatDateTime, orderCode } from "@/lib/format";
import { formatPhone } from "@/lib/text";
import { Badge, BrandTag, CellDate, DefinitionList, DemoBadge, EmptyState, Forbidden, Kpi, KpiStrip, LinkButton, PageHeader, Panel, Table, Td, Th } from "@/components/admin/ui";
import { OrderStatusBadge } from "@/components/admin/badges";
import { ConfirmAction } from "@/components/admin/client";

export const metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await guard("clientes");
  if (!ctx.allowed) return <Forbidden module="Clientes" />;
  const data = await getCustomerDetail(id, ctx.scope);
  if (!data) notFound();
  const { customer: c, orders, metrics } = data;
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  const preferred = metrics.preferredBrandId ? brands.get(metrics.preferredBrandId) : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title={c.name}
        crumbs={[{ href: "/admin/clientes", label: "Clientes" }, { label: c.name }]}
        description={
          <span className="flex items-center gap-2">
            Cliente desde {formatDateTime(c.createdAt)} <DemoBadge show={c.isDemo} />
          </span>
        }
        actions={
          <>
            {can(ctx.auth.perms, "clientes", "editar") && <LinkButton href={`/admin/clientes/${c.id}/editar`}>Editar</LinkButton>}
            {can(ctx.auth.perms, "clientes", "excluir") && (
              <ConfirmAction
                label="Excluir"
                title="Excluir cliente?"
                description="O cadastro sai das listagens; pedidos antigos continuam com o nome registrado."
                action={deleteResourceAction.bind(null, "clientes", c.id)}
              />
            )}
          </>
        }
      />
      <KpiStrip cols={5}>
        <Kpi label="Compras" value={metrics.ordersCount} />
        <Kpi label="Valor total comprado" value={formatBRL(metrics.totalSpent)} />
        <Kpi label="Ticket médio" value={metrics.avgTicket === null ? "—" : formatBRL(metrics.avgTicket)} />
        <Kpi label="Última compra" value={metrics.lastPurchase ? <CellDate value={metrics.lastPurchase} /> : "—"} />
        <Kpi label="Marca preferida" value={preferred ? preferred.name : "—"} />
      </KpiStrip>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Panel title="Cadastro">
          <DefinitionList
            items={[
              ["Telefone", c.phone ? formatPhone(c.phone) : null],
              ["WhatsApp", c.whatsapp ? formatPhone(c.whatsapp) : null],
              ["E-mail", c.email],
              ["Endereço", c.address],
              ["Cidade/UF", [c.city, c.state].filter(Boolean).join("/") || null],
              ["CEP", c.zip],
              ["Mensagens no WhatsApp", c.whatsappOptIn ? <Badge tone="success">Autorizado (opt-in)</Badge> : <Badge>Sem autorização</Badge>],
              ["Observações", c.notes],
            ]}
          />
        </Panel>
        <Panel title="Histórico de pedidos" bodyClassName="p-0">
          {orders.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Data</Th>
                  <Th>Marca</Th>
                  <Th align="right">Itens</Th>
                  <Th align="right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const b = brands.get(o.brand_id);
                  return (
                    <tr key={o.id}>
                      <Td>
                        <Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:underline">
                          #{orderCode(b?.orderPrefix, o.number)}
                        </Link>
                      </Td>
                      <Td>
                        <CellDate value={o.created_at} time />
                      </Td>
                      <Td>{b ? <BrandTag name={b.name} slug={b.slug} /> : "—"}</Td>
                      <Td align="right">{o.items}</Td>
                      <Td align="right">{formatBRL(o.total)}</Td>
                      <Td>
                        <OrderStatusBadge status={o.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Nenhum pedido" />
          )}
        </Panel>
      </div>
    </div>
  );
}

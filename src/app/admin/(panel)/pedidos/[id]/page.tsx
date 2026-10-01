import Link from "next/link";
import { notFound } from "next/navigation";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { allowedTransitions, getOrderDetail } from "@/server/services/orders";
import { isCloudApiConfigured } from "@/server/services/whatsapp";
import { formatBRL, formatDateTime, orderCode, toNumber } from "@/lib/format";
import { formatPhone } from "@/lib/text";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, TEMPLATE_LABELS, type OrderStatus, type TemplateKey } from "@/lib/domain";
import { Badge, BrandTag, DefinitionList, DemoBadge, Forbidden, PageHeader, Panel, Table, Td, Th } from "@/components/admin/ui";
import { OrderStatusBadge } from "@/components/admin/badges";
import { ActionForm, SelectField, SubmitButton, TextAreaField } from "@/components/admin/client";
import { MessageButtons, StatusChanger } from "../order-client";
import { updateOrderInfoAction } from "../actions";

export const metadata = { title: "Pedido" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await guard("pedidos");
  if (!ctx.allowed) return <Forbidden module="Pedidos" />;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();
  const { order, items, history, messages } = detail;
  if (ctx.scope !== "all" && !ctx.scope.includes(order.brandId)) return <Forbidden module="Pedidos desta marca" />;
  const brand = ctx.brands.find((b) => b.id === order.brandId);
  const code = orderCode(brand?.orderPrefix, order.number);
  const canEdit = can(ctx.auth.perms, "pedidos", "editar", order.brandId);
  const canApprove = can(ctx.auth.perms, "pedidos", "aprovar", order.brandId);
  const transitions = allowedTransitions(order.status as OrderStatus).filter(
    (s) => (["cancelado", "devolvido"].includes(s) ? canApprove : canEdit),
  );
  const apiAvailable = await isCloudApiConfigured(order.brandId);
  const missingCost = items.some((i) => i.unitCost === null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Pedido #${code}`}
        crumbs={[{ href: "/admin/pedidos", label: "Pedidos" }, { label: `#${code}` }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {brand && <BrandTag name={brand.name} slug={brand.slug} />}
            <span className="text-stone-500">· {formatDateTime(order.createdAt)}</span>
            <span className="text-stone-500">· {order.source === "painel" ? "registrado no painel" : "loja online"}</span>
            <DemoBadge show={order.isDemo} />
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel title="Itens" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Variação</Th>
                  <Th align="right">Qtd.</Th>
                  <Th align="right">Unitário</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <Td>
                      {it.productId ? (
                        <Link href={`/admin/produtos/${it.productId}`} className="hover:underline">
                          {it.productName}
                        </Link>
                      ) : (
                        it.productName
                      )}
                      <span className="block text-xs text-stone-500">{it.sku}</span>
                    </Td>
                    <Td>{[it.size, it.color].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td align="right">{it.quantity}</Td>
                    <Td align="right">{formatBRL(it.unitPrice)}</Td>
                    <Td align="right">{formatBRL(it.total)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr>
                  <Td className="border-0" />
                  <Td className="border-0" />
                  <Td className="border-0" />
                  <Td align="right" className="border-0 text-stone-500">Subtotal</Td>
                  <Td align="right" className="border-0">{formatBRL(order.subtotal)}</Td>
                </tr>
                {toNumber(order.discount) > 0 && (
                  <tr>
                    <Td className="border-0" colSpan={3} />
                    <Td align="right" className="border-0 text-stone-500">Desconto</Td>
                    <Td align="right" className="border-0">− {formatBRL(order.discount)}</Td>
                  </tr>
                )}
                <tr>
                  <Td className="border-0" colSpan={3} />
                  <Td align="right" className="border-0 text-stone-500">Frete</Td>
                  <Td align="right" className="border-0">{order.shippingLabel === "A combinar" ? "A combinar" : formatBRL(order.shipping)}</Td>
                </tr>
                <tr>
                  <Td className="border-0" colSpan={3} />
                  <Td align="right" className="border-0 font-semibold">Total</Td>
                  <Td align="right" className="border-0 font-semibold">{formatBRL(order.total)}</Td>
                </tr>
              </tfoot>
            </Table>
            {missingCost && (
              <p className="border-t border-stone-200 px-5 py-3 text-xs text-amber-800">
                Há itens sem preço de custo cadastrado: o CMV/DRE deste pedido fica incompleto (não estimamos valores).
              </p>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Cliente">
              <DefinitionList
                items={[
                  ["Nome", order.customerId ? <Link className="hover:underline" href={`/admin/clientes/${order.customerId}`}>{order.customerName}</Link> : order.customerName],
                  ["Telefone", formatPhone(order.customerPhone)],
                  ["WhatsApp", order.customerWhatsapp ? formatPhone(order.customerWhatsapp) : null],
                  ["E-mail", order.customerEmail],
                  ["Endereço", [order.address, order.city && `${order.city}/${order.state ?? ""}`, order.zip].filter(Boolean).join(" · ") || null],
                  ["Observações do cliente", order.notes],
                ]}
              />
            </Panel>
            <Panel title="Pagamento e controle">
              {canEdit ? (
                <ActionForm action={updateOrderInfoAction.bind(null, order.id)} className="space-y-4">
                  <SelectField
                    name="paymentMethod"
                    label="Forma de pagamento"
                    defaultValue={order.paymentMethod}
                    emptyLabel="Não informado"
                    options={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                  <TextAreaField name="notes" label="Observações" defaultValue={order.notes} rows={3} />
                  <SubmitButton variant="secondary">Salvar</SubmitButton>
                </ActionForm>
              ) : (
                <DefinitionList items={[["Pagamento", order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod : null]]} />
              )}
              <div className="mt-5 space-y-1.5 border-t border-stone-100 pt-4 text-xs text-stone-600">
                <p>Estoque: {order.stockCommitted ? <Badge tone="success">baixado</Badge> : <Badge>não baixado</Badge>}</p>
                <p>Financeiro: {order.revenueRegistered ? <Badge tone="success">receita lançada</Badge> : <Badge>sem lançamento</Badge>}</p>
                <p>Canal do WhatsApp: {order.deliveryMethod === "api" ? "API" : "link"}</p>
              </div>
            </Panel>
          </div>

          <Panel title="Histórico de status" bodyClassName="p-0">
            <ol className="divide-y divide-stone-100">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    {h.fromStatus ? `${ORDER_STATUS_LABELS[h.fromStatus as OrderStatus] ?? h.fromStatus} → ` : ""}
                    <strong className="font-medium">{ORDER_STATUS_LABELS[h.toStatus as OrderStatus] ?? h.toStatus}</strong>
                    {h.note && <span className="text-stone-500"> — {h.note}</span>}
                  </span>
                  <span className="text-xs text-stone-500">
                    {h.userName ?? "Cliente / sistema"} · {formatDateTime(h.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Mensagens de WhatsApp" description="Registro de tudo o que foi gerado ou enviado para este pedido." bodyClassName="p-0">
            {messages.length ? (
              <ul className="divide-y divide-stone-100">
                {messages.map((m) => (
                  <li key={m.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{TEMPLATE_LABELS[m.templateKey as TemplateKey] ?? m.templateKey ?? "Mensagem"}</span>
                      <span className="flex items-center gap-2 text-xs text-stone-500">
                        <Badge tone={m.status === "enviado" ? "success" : m.status === "falhou" ? "danger" : "neutral"}>
                          {m.status === "enviado" ? "Enviada (API)" : m.status === "falhou" ? "Falhou" : "Link gerado"}
                        </Badge>
                        {formatDateTime(m.createdAt)}
                      </span>
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-3 font-sans text-xs text-stone-700">{m.body}</pre>
                    {m.error && <p className="mt-1 text-xs text-red-700">{m.error}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-stone-500">Nenhuma mensagem registrada.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Status do pedido">
            {canEdit || canApprove ? (
              <StatusChanger
                orderId={order.id}
                current={order.status as OrderStatus}
                options={transitions}
                stockCommitted={order.stockCommitted}
                revenueRegistered={order.revenueRegistered}
              />
            ) : (
              <p className="text-sm text-stone-600">Você pode visualizar, mas não alterar este pedido.</p>
            )}
          </Panel>
          {canEdit && (
            <Panel title="Falar com o cliente">
              <MessageButtons
                orderId={order.id}
                apiAvailable={apiAvailable}
                templates={(["pedido_recebido", "pagamento_confirmado", "pedido_enviado", "pedido_entregue", "pos_venda"] as TemplateKey[]).map((k) => ({
                  key: k,
                  label: TEMPLATE_LABELS[k],
                }))}
              />
            </Panel>
          )}
          {order.whatsappUrl && (
            <Panel title="Mensagem do cliente (checkout)">
              <p className="text-sm text-stone-600">O cliente foi direcionado ao WhatsApp da loja com o pedido pré-preenchido.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

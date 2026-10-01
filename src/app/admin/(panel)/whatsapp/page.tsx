import Link from "next/link";
import { desc, inArray, sql } from "drizzle-orm";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { getAllCms } from "@/server/services/cms";
import { getDb, schema } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/text";
import { TEMPLATE_LABELS, type TemplateKey } from "@/lib/domain";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/admin/client";
import { Badge, BrandTag, DemoBadge, EmptyState, Forbidden, PageHeader, Panel, Table, Td, Th } from "@/components/admin/ui";
import { saveWhatsappConfigAction } from "./actions";

export const metadata = { title: "WhatsApp" };

export default async function WhatsappPage() {
  const ctx = await guard("whatsapp");
  if (!ctx.allowed) return <Forbidden module="WhatsApp" />;
  const cms = await getAllCms();
  const db = await getDb();
  const brandIds = ctx.scope === "all" ? ctx.brands.map((b) => b.id) : ctx.scope;
  const log = brandIds.length
    ? await db
        .select()
        .from(schema.whatsappMessagesLog)
        .where(sql`${schema.whatsappMessagesLog.brandId} is null or ${inArray(schema.whatsappMessagesLog.brandId, brandIds)}`)
        .orderBy(desc(schema.whatsappMessagesLog.createdAt))
        .limit(40)
    : [];
  const tokenConfigured = !!process.env.WHATSAPP_CLOUD_API_TOKEN;
  const canConfigure = can(ctx.auth.perms, "whatsapp", "configurar");
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  const visible = ctx.visibleBrands.filter((b) => ctx.scope === "all" || ctx.scope.includes(b.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="Números por marca e canal de envio. Sem API configurada, o sistema gera links wa.me e registra — nunca finge envio automático."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        {visible.map((b) => {
          const w = cms.byBrand.get(b.id)?.whatsapp;
          return (
            <Panel key={b.id} title={<BrandTag name={b.name} slug={b.slug} />} description="Recebe os pedidos da loja e envia as mensagens ao cliente.">
              {canConfigure ? (
                <ActionForm action={saveWhatsappConfigAction.bind(null, b.id)} className="space-y-4">
                  <TextField name="number" label="Número do WhatsApp" defaultValue={w?.number ?? ""} placeholder="55 11 91234-5678" help="Com DDI e DDD." />
                  <SelectField
                    name="driver"
                    label="Canal de envio"
                    defaultValue={w?.driver ?? "link"}
                    options={[
                      { value: "link", label: "Link (wa.me) — padrão, sem API" },
                      { value: "cloud_api", label: "WhatsApp Business Cloud API" },
                    ]}
                  />
                  <TextField
                    name="cloudPhoneNumberId"
                    label="Phone number ID (Cloud API)"
                    defaultValue={w?.cloud_phone_number_id ?? ""}
                    help="Só para a Cloud API. O token fica na variável de ambiente WHATSAPP_CLOUD_API_TOKEN."
                  />
                  <SubmitButton variant="secondary">Salvar</SubmitButton>
                </ActionForm>
              ) : (
                <p className="text-sm">{w?.number ? formatPhone(w.number) : <span className="text-stone-500">Configuração pendente</span>}</p>
              )}
            </Panel>
          );
        })}
        <Panel title="Número geral" description="Usado quando a marca não tem número próprio.">
          {canConfigure ? (
            <ActionForm action={saveWhatsappConfigAction.bind(null, null)} className="space-y-4">
              <TextField name="number" label="Número" defaultValue={cms.globalWhatsapp.number ?? ""} placeholder="55 11 91234-5678" />
              <SubmitButton variant="secondary">Salvar</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm">{cms.globalWhatsapp.number ? formatPhone(cms.globalWhatsapp.number) : "Configuração pendente"}</p>
          )}
          <div className="mt-5 border-t border-stone-100 pt-4 text-xs text-stone-600">
            Token da Cloud API: {tokenConfigured ? <Badge tone="success">configurado</Badge> : <Badge tone="warning">configuração pendente</Badge>}
            <p className="mt-2">
              Mensagens livres pela Cloud API só são entregues dentro da janela de 24h de conversa; fora dela a Meta exige modelos aprovados.
              Consulte a documentação oficial antes de ativar.
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="Mensagens registradas" description="Pedidos enviados pelos clientes e mensagens geradas/enviadas pela loja." bodyClassName="p-0">
        {log.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Modelo</Th>
                <Th>Marca</Th>
                <Th>Para</Th>
                <Th>Canal</Th>
                <Th>Status</Th>
                <Th>Pedido</Th>
              </tr>
            </thead>
            <tbody>
              {log.map((m) => {
                const b = m.brandId ? brands.get(m.brandId) : null;
                return (
                  <tr key={m.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(m.createdAt)}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        {TEMPLATE_LABELS[m.templateKey as TemplateKey] ?? m.templateKey ?? "—"} <DemoBadge show={m.isDemo} />
                      </span>
                    </Td>
                    <Td>{b ? <BrandTag name={b.name} slug={b.slug} /> : "—"}</Td>
                    <Td>{m.toNumber ? formatPhone(m.toNumber) : <span className="text-stone-400">não configurado</span>}</Td>
                    <Td>{m.deliveryMethod === "api" ? "API" : "Link"}</Td>
                    <Td>
                      <Badge tone={m.status === "enviado" ? "success" : m.status === "falhou" ? "danger" : "neutral"}>
                        {m.status === "enviado" ? "Enviada" : m.status === "falhou" ? "Falhou" : "Link gerado"}
                      </Badge>
                    </Td>
                    <Td>
                      {m.orderId ? (
                        <Link href={`/admin/pedidos/${m.orderId}`} className="text-xs underline">
                          abrir
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma mensagem registrada" />
        )}
      </Panel>
    </div>
  );
}

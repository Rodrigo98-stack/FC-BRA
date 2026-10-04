import { isNull } from "drizzle-orm";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { getDb, schema } from "@/server/db";
import { isCloudApiConfigured } from "@/server/services/whatsapp";
import { TEMPLATE_KEYS, TEMPLATE_LABELS, TEMPLATE_VARIABLES } from "@/lib/domain";
import { ActionForm, CheckboxField, ConfirmAction, SubmitButton, TextAreaField, TextField } from "@/components/admin/client";
import { Badge, Forbidden, PageHeader, Panel } from "@/components/admin/ui";
import { resetTemplateAction, saveAutomationAction, saveTemplateAction } from "../whatsapp/actions";

export const metadata = { title: "Automações" };

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  const ctx = await guard("automacoes");
  if (!ctx.allowed) return <Forbidden module="Automações" />;
  const sp = await searchParams;
  const brandId = sp.marca && ctx.brands.some((b) => b.id === sp.marca) ? sp.marca : null;
  const db = await getDb();
  const [templates, automations] = await Promise.all([db.select().from(schema.whatsappTemplates), db.select().from(schema.automations).where(isNull(schema.automations.brandId))]);
  const canEditTemplates = can(ctx.auth.perms, "automacoes", "editar", brandId);
  const canConfigure = can(ctx.auth.perms, "automacoes", "configurar");
  const apiByBrand = await Promise.all(ctx.visibleBrands.map(async (b) => [b.name, await isCloudApiConfigured(b.id)] as const));
  const anyApi = apiByBrand.some(([, ok]) => ok);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações de WhatsApp"
        description="Mensagens por evento do pedido. Regra: nada é enviado automaticamente sem API configurada e opt-in explícito do cliente — sem API, o sistema gera o link e registra."
      />
      <Panel title="Situação da API">
        <ul className="flex flex-wrap gap-4 text-sm">
          {apiByBrand.map(([name, ok]) => (
            <li key={name} className="flex items-center gap-2">
              {name}: {ok ? <Badge tone="success">Cloud API ativa</Badge> : <Badge tone="warning">Somente link (API não configurada)</Badge>}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Gatilhos" description={anyApi ? "Com a API ativa, as automações ligadas enviam a mensagem quando o status muda." : "Sem API: as automações ligadas geram o link da mensagem no pedido para envio manual."} bodyClassName="p-0">
        <ul className="divide-y divide-stone-100">
          {automations.map((a) => (
            <li key={a.id} className="px-5 py-4">
              <ActionForm action={saveAutomationAction.bind(null, a.id)} className="grid items-end gap-4 md:grid-cols-[1.4fr_auto_auto_120px_auto]">
                <div>
                  <p className="font-medium">{TEMPLATE_LABELS[a.triggerEvent as keyof typeof TEMPLATE_LABELS] ?? a.triggerEvent}</p>
                  <p className="text-xs text-stone-500">Modelo: {TEMPLATE_LABELS[a.templateKey as keyof typeof TEMPLATE_LABELS] ?? a.templateKey}</p>
                </div>
                <CheckboxField name="isEnabled" label="Ligada" defaultChecked={a.isEnabled} />
                <CheckboxField name="requireOptIn" label="Exigir opt-in" defaultChecked={a.requireOptIn} />
                <TextField name="delayMinutes" label="Atraso (min)" type="number" defaultValue={a.delayMinutes} />
                {canConfigure ? <SubmitButton variant="secondary">Salvar</SubmitButton> : <span />}
              </ActionForm>
            </li>
          ))}
        </ul>
        <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">
          O atraso fica registrado para uso futuro com uma fila de envios; hoje o disparo ocorre na mudança de status.
        </p>
      </Panel>

      <Panel
        title="Modelos de mensagem"
        description={`Variáveis disponíveis: ${TEMPLATE_VARIABLES.join(", ")}. No modelo de finalização: {marca}, {numero}, {itens}, {subtotal}, {frete}, {total}, {nome}, {telefone}, {obs}, {entrega}.`}
        actions={
          ctx.visibleBrands.length > 0 ? (
            <form className="flex items-center gap-2">
              <select name="marca" defaultValue={brandId ?? ""} className="admin-input w-auto py-1.5">
                <option value="">Modelo geral (todas as marcas)</option>
                {ctx.visibleBrands.map((b) => (
                  <option key={b.id} value={b.id}>
                    Personalizar para {b.name}
                  </option>
                ))}
              </select>
              <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm">Abrir</button>
            </form>
          ) : null
        }
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-stone-100">
          {TEMPLATE_KEYS.map((key) => {
            const general = templates.find((t) => t.key === key && t.brandId === null);
            const specific = brandId ? templates.find((t) => t.key === key && t.brandId === brandId) : null;
            const current = specific ?? general;
            return (
              <li key={key} className="px-5 py-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {TEMPLATE_LABELS[key]}{" "}
                    {brandId && (specific ? <Badge tone="info">personalizado para a marca</Badge> : <Badge>usando o modelo geral</Badge>)}
                  </p>
                  {brandId && specific && canEditTemplates && (
                    <ConfirmAction
                      label="Voltar ao modelo geral"
                      variant="ghost"
                      requireReason={false}
                      requireTyping={false}
                      title="Voltar ao modelo geral?"
                      action={async () => {
                        "use server";
                        return resetTemplateAction(key, brandId);
                      }}
                    />
                  )}
                </div>
                {canEditTemplates ? (
                  <ActionForm action={saveTemplateAction.bind(null, key, brandId)} className="space-y-3">
                    <TextAreaField name="body" label="Mensagem" defaultValue={current?.body ?? ""} rows={key === "checkout" ? 14 : 4} />
                    <div className="flex items-center gap-4">
                      <CheckboxField name="isActive" label="Ativo" defaultChecked={current?.isActive ?? true} />
                      <SubmitButton variant="secondary">Salvar modelo</SubmitButton>
                    </div>
                  </ActionForm>
                ) : (
                  <pre className="whitespace-pre-wrap rounded bg-stone-50 p-3 font-sans text-sm text-stone-700">{current?.body}</pre>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { getAllCms } from "@/server/services/cms";
import { countDemoData } from "@/server/services/demo-data";
import { isEmailConfigured } from "@/server/email";
import { ActionForm, ConfirmAction, ImageField, SubmitButton, TextField } from "@/components/admin/client";
import { Badge, BrandTag, Forbidden, PageHeader, Panel } from "@/components/admin/ui";
import { clearDemoAction, saveSiteAction, setBrandActiveAction } from "./actions";

export const metadata = { title: "Configurações" };

function Status({ ok, okText = "configurado", pending = "configuração pendente" }: { ok: boolean; okText?: string; pending?: string }) {
  return ok ? <Badge tone="success">{okText}</Badge> : <Badge tone="warning">{pending}</Badge>;
}

export default async function SettingsPage() {
  const ctx = await guard(null);
  const { perms } = ctx.auth;
  const canCms = can(perms, "cms", "visualizar") || can(perms, "cms", "editar");
  const canConfig = can(perms, "configuracoes", "configurar") || can(perms, "configuracoes", "visualizar");
  if (!canCms && !canConfig) return <Forbidden module="Configurações" />;
  const [cms, demo] = await Promise.all([getAllCms(), canConfig ? countDemoData() : Promise.resolve({} as Record<string, number>)]);
  const demoTotal = Object.values(demo).reduce((a, b) => a + Number(b), 0);
  const brandsForUser = ctx.brands.filter((b) => can(perms, "cms", "visualizar", b.id) || can(perms, "configuracoes", "configurar", b.id) || can(perms, "cms", "editar", b.id));

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Identidade visual e conteúdo de cada marca, regras de frete, dados gerais e situação do sistema." />
      <div className="grid gap-6 lg:grid-cols-2">
        {brandsForUser.map((b) => {
          const c = cms.byBrand.get(b.id);
          return (
            <Panel
              key={b.id}
              title={<BrandTag name={b.name} slug={b.slug} />}
              actions={
                <Link href={`/admin/configuracoes/marca/${b.slug}`} className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">
                  Editar marca
                </Link>
              }
            >
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                <li>Logo: <Status ok={!!c?.identity.logo_url} /></li>
                <li>Favicon: <Status ok={!!c?.identity.favicon_url} /></li>
                <li>Paleta: <Status ok={!c?.identity.palette_is_placeholder} okText="oficial" pending="placeholder" /></li>
                <li>WhatsApp: <Status ok={!!(c?.whatsapp.number || cms.globalWhatsapp.number)} /></li>
                <li>Políticas: <Status ok={!!c && Object.values(c.policies).some(Boolean)} /></li>
                <li>Frete: <Badge>{c?.shipping.mode === "fixo" ? "valor fixo" : c?.shipping.mode === "gratis" ? "grátis" : "a combinar"}</Badge></li>
                <li>Loja: {b.isActive ? <Badge tone="success">no ar</Badge> : <Badge tone="danger">desativada</Badge>}</li>
              </ul>
              {can(perms, "configuracoes", "configurar", b.id) && (
                <div className="mt-4 border-t border-stone-100 pt-4">
                  <ConfirmAction
                    label={b.isActive ? "Desativar loja" : "Reativar loja"}
                    variant={b.isActive ? "dangerOutline" : "secondary"}
                    title={b.isActive ? `Desativar a loja ${b.name}?` : `Reativar a loja ${b.name}?`}
                    description={b.isActive ? "A loja sai do ar para os clientes. O painel e os dados continuam disponíveis." : undefined}
                    action={setBrandActiveAction.bind(null, b.id, !b.isActive)}
                  />
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      {can(perms, "cms", "editar") && (
        <Panel title="Dados gerais do site">
          <ActionForm action={saveSiteAction} className="grid gap-4 sm:grid-cols-2">
            <TextField name="name" label="Nome do site" required defaultValue={cms.site.name} />
            <TextField name="selection_title" label="Título da página de seleção de marca" required defaultValue={cms.site.selection_title} />
            <ImageField name="favicon_url" label="Favicon geral" defaultValue={cms.site.favicon_url} className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <SubmitButton variant="secondary">Salvar</SubmitButton>
            </div>
          </ActionForm>
        </Panel>
      )}

      {canConfig && (
        <Panel title="Sistema" description="Situação das integrações. Segredos ficam apenas em variáveis de ambiente (Netlify), nunca no código.">
          <ul className="grid gap-3 text-sm sm:grid-cols-2">
            <li>
              Banco de dados:{" "}
              {ctx.mode === "postgres" ? (
                <Badge tone="success">PostgreSQL (Supabase)</Badge>
              ) : (
                <Badge tone="demo">Demonstração (embutido{ctx.store === "netlify-blobs" ? " · Netlify Blobs" : ""})</Badge>
              )}
            </li>
            <li>
              Segredo da aplicação (APP_SECRET): <Status ok={!!process.env.APP_SECRET} okText="definido" pending="gerado automaticamente" />
            </li>
            <li>
              E-mail para convites (Resend): <Status ok={isEmailConfigured()} pending="não configurado (links manuais)" />
            </li>
            <li>
              WhatsApp Cloud API (token): <Status ok={!!process.env.WHATSAPP_CLOUD_API_TOKEN} pending="não configurado (usa links)" />
            </li>
            <li>
              Endereço público (SITE_URL): <Status ok={!!(process.env.SITE_URL || process.env.URL)} />
            </li>
          </ul>
          {ctx.mode === "demo" && (
            <div className="mt-5 rounded-md border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
              <p className="font-medium">Para operar de verdade, conecte o Supabase:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Crie um projeto no Supabase e copie a connection string do pooler (modo transação, porta 6543).</li>
                <li>No Netlify: Site configuration › Environment variables › adicione <code>DATABASE_URL</code> e <code>APP_SECRET</code>.</li>
                <li>Publique novamente. As migrations são aplicadas automaticamente e o banco começa vazio (sem DEMO).</li>
              </ol>
            </div>
          )}
          <div className="mt-6 border-t border-stone-200 pt-5">
            <p className="text-sm font-medium text-stone-900">Dados DEMO</p>
            {demoTotal > 0 ? (
              <>
                <p className="mt-1 text-sm text-stone-600">
                  Existem registros fictícios marcados como DEMO:{" "}
                  {Object.entries(demo)
                    .filter(([, n]) => Number(n) > 0)
                    .map(([k, n]) => `${n} ${k}`)
                    .join(", ")}
                  .
                </p>
                {can(perms, "configuracoes", "configurar") && can(perms, "configuracoes", "excluir") && (
                  <div className="mt-3">
                    <ConfirmAction
                      label="Limpar dados DEMO"
                      variant="danger"
                      title="Remover todos os dados DEMO?"
                      description="Remove produtos, pedidos, clientes, usuários, lançamentos e eventos marcados como DEMO. Dados reais não são afetados. Esta ação não pode ser desfeita."
                      action={clearDemoAction}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-stone-600">Nenhum dado DEMO no sistema.</p>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { FONT_OPTIONS, getBrandCms, googleFontsHref, LOOK_OPTIONS, POLICY_LABELS } from "@/server/services/cms";
import { ActionForm, CheckboxField, ImageField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/admin/client";
import { Badge, Forbidden, LinkButton, PageHeader, Panel } from "@/components/admin/ui";
import { ColorField, InstitutionalImages, PalettePreview, ShippingFields } from "../../settings-client";
import { saveContactAction, saveHomeAction, saveIdentityAction, savePoliciesAction, saveSeoAction, saveShippingAction } from "../../actions";

export const metadata = { title: "Configurações da marca" };

export default async function BrandSettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await guard(null);
  const brand = ctx.brands.find((b) => b.slug === slug);
  if (!brand) notFound();
  const { perms } = ctx.auth;
  const canCms = can(perms, "cms", "editar", brand.id);
  const canConfig = can(perms, "configuracoes", "configurar", brand.id);
  if (!canCms && !canConfig && !can(perms, "cms", "visualizar", brand.id)) return <Forbidden module="Configurações da marca" />;
  const cms = await getBrandCms(brand.id);
  const id = cms.identity;
  const fonts = googleFontsHref(FONT_OPTIONS as unknown as string[]);
  const fontOptions = FONT_OPTIONS.map((f) => ({ value: f, label: f }));

  return (
    <div className="space-y-6">
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <PageHeader
        title={`${brand.name} · identidade e conteúdo`}
        description="Tudo o que aparece na loja desta marca, editável sem código. Campos vazios aparecem na loja como “Configuração pendente”."
        crumbs={[{ href: "/admin/configuracoes", label: "Configurações" }, { label: brand.name }]}
        actions={<LinkButton href={`/${brand.slug}`}>Ver loja</LinkButton>}
      />
      <Panel title="Identidade visual" description={id.palette_is_placeholder ? "A paleta atual é um placeholder sugerido — substitua pelas cores oficiais." : undefined}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          {canCms ? (
            <ActionForm action={saveIdentityAction.bind(null, brand.id)} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <ImageField name="logo_url" label="Logo" defaultValue={id.logo_url} help={`Enquanto vazio, a loja mostra o nome e ${id.logo_placeholder}.`} className="sm:col-span-2" />
                <CheckboxField name="logo_shows_name" label="O logo já traz o nome da marca escrito" defaultChecked={id.logo_shows_name} help="Marcado: a loja mostra só o logo. Desmarcado: mostra o símbolo e o nome ao lado." className="sm:col-span-2" />
                <ImageField name="favicon_url" label="Favicon" defaultValue={id.favicon_url} help="PNG ou ICO quadrado, 64×64 px ou maior." className="sm:col-span-2" />
                <TextField name="tagline" label="Frase da marca" defaultValue={id.tagline} />
                <TextField name="card_subtitle" label="Subtítulo na seleção de marca" defaultValue={id.card_subtitle} />
              </div>
              <div>
                <p className="admin-label">Paleta de cores</p>
                <div className="grid gap-3 sm:grid-cols-5">
                  <ColorField name="primary" label="Primária" defaultValue={id.palette.primary} />
                  <ColorField name="secondary" label="Secundária" defaultValue={id.palette.secondary} />
                  <ColorField name="accent" label="Destaque" defaultValue={id.palette.accent} />
                  <ColorField name="text" label="Texto" defaultValue={id.palette.text} />
                  <ColorField name="background" label="Fundo" defaultValue={id.palette.background} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField name="display" label="Fonte de títulos" defaultValue={id.typography.display} options={fontOptions} />
                <SelectField name="body" label="Fonte de texto" defaultValue={id.typography.body} options={fontOptions} />
                <SelectField name="look" label="Estilo visual da loja" defaultValue={id.look} options={LOOK_OPTIONS} className="sm:col-span-2" />
              </div>
              <SubmitButton>Publicar identidade</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-stone-600">Somente leitura.</p>
          )}
          <div className="space-y-3">
            <p className="text-xs text-stone-500">Prévia (valores publicados)</p>
            <PalettePreview colors={id.palette} fonts={id.typography} name={brand.name} />
            {id.palette_is_placeholder && <Badge tone="warning">Paleta placeholder</Badge>}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Capa da home" description="Usada quando não há banner de destaque publicado.">
          {canCms ? (
            <ActionForm action={saveHomeAction.bind(null, brand.id)} className="space-y-4">
              <TextField name="hero_title" label="Título" defaultValue={cms.home.hero_title} placeholder={brand.name} />
              <TextField name="hero_subtitle" label="Subtítulo" defaultValue={cms.home.hero_subtitle} placeholder={id.tagline ?? ""} />
              <ImageField name="hero_image_url" label="Imagem de capa" defaultValue={cms.home.hero_image_url} help="Vertical (4:5), 1200×1500 px ou maior." />
              <InstitutionalImages defaults={cms.home.institutional_images ?? []} />
              <SubmitButton variant="secondary">Salvar capa</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-stone-600">Somente leitura.</p>
          )}
        </Panel>
        <Panel title="Contato e redes sociais">
          {canCms ? (
            <ActionForm action={saveContactAction.bind(null, brand.id)} className="grid gap-4 sm:grid-cols-2">
              <TextField name="whatsapp" label="WhatsApp exibido no site" defaultValue={cms.contact.whatsapp} help="O número que recebe pedidos fica em WhatsApp." />
              <TextField name="phone" label="Telefone" defaultValue={cms.contact.phone} />
              <TextField name="email" label="E-mail" defaultValue={cms.contact.email} className="sm:col-span-2" />
              <TextField name="address" label="Endereço" defaultValue={cms.contact.address} className="sm:col-span-2" />
              <TextField name="instagram" label="Instagram (link)" defaultValue={cms.social.instagram} placeholder="https://instagram.com/…" />
              <TextField name="facebook" label="Facebook (link)" defaultValue={cms.social.facebook} />
              <TextField name="tiktok" label="TikTok (link)" defaultValue={cms.social.tiktok} />
              <TextField name="pinterest" label="Pinterest (link)" defaultValue={cms.social.pinterest} />
              <TextField name="youtube" label="YouTube (link)" defaultValue={cms.social.youtube} />
              <div className="sm:col-span-2">
                <SubmitButton variant="secondary">Salvar contato</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-stone-600">Somente leitura.</p>
          )}
        </Panel>
      </div>

      <Panel title="Políticas" description="Exibidas no rodapé e na página de produto.">
        {canCms ? (
          <ActionForm action={savePoliciesAction.bind(null, brand.id)} className="grid gap-4 lg:grid-cols-2">
            {(Object.keys(POLICY_LABELS) as (keyof typeof POLICY_LABELS)[]).map((k) => (
              <TextAreaField key={k} name={k} label={POLICY_LABELS[k]} defaultValue={cms.policies[k]} rows={6} />
            ))}
            <div className="lg:col-span-2">
              <SubmitButton variant="secondary">Publicar políticas</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-stone-600">Somente leitura.</p>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="SEO da marca">
          {canCms ? (
            <ActionForm action={saveSeoAction.bind(null, brand.id)} className="space-y-4">
              <TextField name="title" label="Título (Google)" defaultValue={cms.seo.title} placeholder={brand.name} />
              <TextAreaField name="description" label="Descrição (Google e redes)" defaultValue={cms.seo.description} rows={3} maxLength={300} />
              <ImageField name="og_image_url" label="Imagem ao compartilhar (Open Graph)" defaultValue={cms.seo.og_image_url} help="1200×630 px." />
              <SubmitButton variant="secondary">Salvar SEO</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-stone-600">Somente leitura.</p>
          )}
        </Panel>
        <Panel title="Frete" description="Sem regra, o frete aparece como “A combinar” e é tratado no WhatsApp.">
          {canConfig ? (
            <ActionForm action={saveShippingAction.bind(null, brand.id)} className="space-y-4">
              <ShippingFields defaults={cms.shipping} />
              <SubmitButton variant="secondary">Salvar frete</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-stone-600">Exige a permissão Configurações › Configurar.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

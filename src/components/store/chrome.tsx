import Link from "next/link";
import type { Brand, Category } from "@/server/db/schema";
import type { BrandCms } from "@/server/services/cms";
import { POLICY_LABELS } from "@/server/services/cms";
import { CONFIG_PENDING } from "@/lib/format";
import { formatPhone } from "@/lib/text";
import { CartLink, MobileNav } from "./header-client";
import { BrandLogo } from "./ui";

export function StoreHeader({ brand, cms, categories }: { brand: Brand; cms: BrandCms; categories: Category[] }) {
  const nav = categories.filter((c) => c.isActive);
  return (
    <header className="store store-header sticky top-0 z-30 border-b hairline [--header-h:64px] lg:[--header-h:auto]">
      <div className="mx-auto grid max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center px-5 py-3 lg:px-10 lg:pt-6 lg:pb-0">
        <div className="flex items-center gap-6">
          <MobileNav brand={brand.slug} categories={nav.map((c) => ({ slug: c.slug, name: c.name }))} />
          <form action={`/${brand.slug}/busca`} className="hidden lg:block" role="search">
            <label className="sr-only" htmlFor="h-q">
              Buscar na {brand.name}
            </label>
            <input
              id="h-q"
              name="q"
              placeholder="Buscar"
              className="w-44 border-b hairline bg-transparent py-1.5 text-[13px] outline-none transition-[width] focus:w-60 focus:border-current"
            />
          </form>
        </div>
        <Link href={`/${brand.slug}`} className="block text-center" aria-label={`${brand.name} — início`}>
          <BrandLogo
            name={brand.name}
            identity={cms.identity}
            variant="header"
            nameClassName="text-[19px] tracking-[0.03em] sm:text-[28px] lg:text-[32px]"
          />
        </Link>
        <div className="flex items-center justify-end gap-6">
          <Link href="/" className="muted hidden text-[13px] hover:opacity-100 lg:inline">
            Trocar de loja
          </Link>
          <CartLink brand={brand.slug} />
        </div>
      </div>
      <nav aria-label="Categorias" className="mx-auto hidden max-w-[1400px] px-10 lg:block">
        <ul className="flex flex-wrap justify-center gap-x-8 py-4 text-[13px]">
          {nav.map((c) => (
            <li key={c.id}>
              <Link href={`/${brand.slug}/${c.slug}`} className="nav-link" style={c.kind === "promocoes" ? { color: "var(--brand-accent)" } : undefined}>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  youtube: "YouTube",
};

export function StoreFooter({ brand, cms }: { brand: Brand; cms: BrandCms }) {
  const socials = Object.entries(cms.social).filter(([, v]) => !!v) as [string, string][];
  const policies = (Object.keys(POLICY_LABELS) as (keyof typeof POLICY_LABELS)[]).filter((k) => cms.policies[k]);
  return (
    <footer className={`store mt-24 border-t hairline ${cms.identity.look === "urbano" ? "grain" : ""}`}>
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
        <div>
          <BrandLogo name={brand.name} identity={cms.identity} variant="footer" nameClassName="text-3xl" />
          <p className="muted mt-4 max-w-xs text-sm leading-relaxed">{cms.identity.tagline ?? brand.positioning}</p>
        </div>
        <div className="text-sm">
          <h2 className="mb-4 font-medium">Atendimento</h2>
          <ul className="muted space-y-2">
            <li>WhatsApp: {cms.contact.whatsapp || cms.whatsapp.number ? formatPhone(cms.contact.whatsapp ?? cms.whatsapp.number) : CONFIG_PENDING}</li>
            <li>Telefone: {cms.contact.phone ? formatPhone(cms.contact.phone) : CONFIG_PENDING}</li>
            <li>E-mail: {cms.contact.email ?? CONFIG_PENDING}</li>
            <li>Endereço: {cms.contact.address ?? CONFIG_PENDING}</li>
          </ul>
        </div>
        <div className="text-sm">
          <h2 className="mb-4 font-medium">Políticas</h2>
          {policies.length ? (
            <ul className="muted space-y-2">
              {policies.map((k) => (
                <li key={k}>
                  <Link href={`/${brand.slug}/politicas/${k}`} className="hover:underline">
                    {POLICY_LABELS[k]}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{CONFIG_PENDING}</p>
          )}
        </div>
        <div className="text-sm">
          <h2 className="mb-4 font-medium">Redes sociais</h2>
          {socials.length ? (
            <ul className="muted space-y-2">
              {socials.map(([k, url]) => (
                <li key={k}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {SOCIAL_LABELS[k] ?? k}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{CONFIG_PENDING}</p>
          )}
          <Link href="/" className="mt-8 inline-block underline underline-offset-4">
            Conhecer a outra loja
          </Link>
        </div>
      </div>
      <div className="border-t hairline">
        <p className="muted mx-auto max-w-[1400px] px-5 py-6 text-xs lg:px-10">
          © {new Date().getFullYear()} {brand.name}
        </p>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { getActiveBrands } from "@/server/services/brands";
import { getAllCms, googleFontsHref, themeStyle } from "@/server/services/cms";
import { Wordmark } from "@/components/store/ui";

/** §5 — Home de seleção de marca: duas "portas", uma para cada loja. */
export default async function BrandSelection() {
  const [brands, cms] = await Promise.all([getActiveBrands(), getAllCms()]);
  const fonts = googleFontsHref(
    brands.flatMap((b) => {
      const id = cms.byBrand.get(b.id)?.identity;
      return id ? [id.typography.display, id.typography.body] : [];
    }),
  );
  return (
    <main className="relative flex min-h-svh flex-col md:flex-row">
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <h1 className="pointer-events-none absolute inset-x-0 top-0 z-10 py-5 text-center text-[11px] font-medium tracking-[0.32em] text-white mix-blend-difference">
        {cms.site.selection_title}
      </h1>
      {brands.map((b) => {
        const brandCms = cms.byBrand.get(b.id);
        if (!brandCms) return null;
        const id = brandCms.identity;
        const keywords = id.tagline ?? b.positioning;
        return (
          <Link
            key={b.id}
            href={`/${b.slug}`}
            style={themeStyle(id)}
            className="store group relative flex min-h-[50svh] flex-1 flex-col items-center justify-center px-8 py-20 text-center transition-[flex-grow] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] focus-visible:outline-offset-[-12px] motion-safe:hover:flex-[1.3] md:min-h-svh"
          >
            <span className="muted text-sm">{id.card_subtitle ?? b.audience}</span>
            <Wordmark
              name={b.name}
              logoUrl={id.logo_url}
              placeholder={id.logo_placeholder}
              showPlaceholder
              className="mt-6 text-[clamp(3rem,7vw,6.5rem)] tracking-[0.02em]"
            />
            {keywords && <span className="mt-7 max-w-xs text-[15px] leading-relaxed opacity-80">{keywords}</span>}
            <span className="btn-brand-outline mt-12 transition-colors group-hover:border-[var(--brand-text)] group-hover:bg-[var(--brand-text)] group-hover:text-[var(--brand-bg)]">
              Entrar na loja
            </span>
          </Link>
        );
      })}
      {brands.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-10 text-center text-stone-600">
          Nenhuma loja ativa no momento.
        </div>
      )}
    </main>
  );
}

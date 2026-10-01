import Link from "next/link";
import { getActiveBrands } from "@/server/services/brands";
import { getAllCms, googleFontsHref, themeStyle } from "@/server/services/cms";
import { BrandLogo } from "@/components/store/ui";
import { Tilt } from "@/components/store/fx-client";

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
    <main className="doors relative flex min-h-svh flex-col md:flex-row">
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <h1 className="pointer-events-none absolute inset-x-0 top-0 z-10 py-5 text-center text-[11px] font-medium tracking-[0.32em] text-white mix-blend-difference">
        {cms.site.selection_title}
      </h1>
      {brands.map((b, i) => {
        const brandCms = cms.byBrand.get(b.id);
        if (!brandCms) return null;
        const id = brandCms.identity;
        const urban = id.look === "urbano";
        const keywords = id.tagline ?? b.positioning;
        return (
          <Link
            key={b.id}
            href={`/${b.slug}`}
            style={themeStyle(id)}
            data-look={id.look}
            data-tilt-host
            className={`store door group relative flex min-h-[60svh] flex-1 flex-col items-center justify-center overflow-hidden px-8 pb-16 pt-20 text-center focus-visible:outline-offset-[-12px] motion-safe:hover:flex-[1.3] md:min-h-svh ${urban ? "grain spotlight" : "rings"}`}
          >
            <span className="fade-up muted text-sm" style={{ "--d": `${0.2 + i * 0.15}s` } as React.CSSProperties}>
              {id.card_subtitle ?? b.audience}
            </span>
            {urban ? (
              <Tilt className="mt-4">
                <BrandLogo name={b.name} identity={id} variant="door" animate="intro" nameClassName="text-[clamp(3rem,7vw,6.5rem)]" />
              </Tilt>
            ) : (
              <span className="mt-8 transition-transform duration-700 ease-out group-hover:scale-[1.04]">
                <BrandLogo name={b.name} identity={id} variant="door" animate="intro" nameClassName="text-[clamp(2.6rem,5.4vw,5rem)] tracking-[0.02em]" />
              </span>
            )}
            {keywords && (
              <span className="fade-up mt-7 max-w-xs text-[15px] leading-relaxed opacity-80" style={{ "--d": `${0.9 + i * 0.15}s` } as React.CSSProperties}>
                {keywords}
              </span>
            )}
            <span
              className="btn-brand-outline fade-up mt-10 transition-colors group-hover:border-[var(--brand-accent)] group-hover:bg-[var(--brand-accent)] group-hover:text-[var(--brand-bg)]"
              style={{ "--d": `${1.1 + i * 0.15}s` } as React.CSSProperties}
            >
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

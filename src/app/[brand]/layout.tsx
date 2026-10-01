import type { Metadata } from "next";
import { loadStore } from "@/server/store-context";
import { googleFontsHref, themeStyle } from "@/server/services/cms";
import { StoreFooter, StoreHeader } from "@/components/store/chrome";
import { Track } from "@/components/store/track";

type Props = { children: React.ReactNode; params: Promise<{ brand: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { brand: slug } = await params;
  const { brand, cms } = await loadStore(slug);
  const title = cms.seo.title ?? brand.name;
  const description = cms.seo.description ?? `${brand.name} — ${brand.positioning ?? ""}`.trim();
  const og = cms.seo.og_image_url ?? cms.home.hero_image_url ?? undefined;
  return {
    title: { default: title, template: `%s · ${brand.name}` },
    description,
    alternates: { canonical: `/${brand.slug}` },
    icons: cms.identity.favicon_url ? { icon: cms.identity.favicon_url } : undefined,
    openGraph: { title, description, siteName: brand.name, type: "website", locale: "pt_BR", images: og ? [og] : undefined },
    twitter: { card: og ? "summary_large_image" : "summary", title, description, images: og ? [og] : undefined },
  };
}

export default async function BrandLayout({ children, params }: Props) {
  const { brand: slug } = await params;
  const { brand, cms, categories } = await loadStore(slug);
  const fonts = googleFontsHref([cms.identity.typography.display, cms.identity.typography.body]);
  return (
    <div className="store flex min-h-screen flex-col" style={themeStyle(cms.identity)} data-brand={brand.slug} data-look={cms.identity.look}>
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <StoreHeader brand={brand} cms={cms} categories={categories} />
      <main className="flex-1">{children}</main>
      <StoreFooter brand={brand} cms={cms} />
      <Track brand={brand.slug} type="page_view" />
    </div>
  );
}

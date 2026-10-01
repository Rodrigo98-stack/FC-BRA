export const dynamic = "force-dynamic";

import { getBrandBySlug } from "@/server/services/brands";
import { getOrigin } from "@/server/request";
import { getStoreCategories, listSitemapEntries } from "@/server/services/catalog";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function GET(_req: Request, { params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return new Response("Não encontrado", { status: 404 });
  const base = process.env.SITE_URL ?? (await getOrigin());
  const [categories, products] = await Promise.all([getStoreCategories(brand.id), listSitemapEntries(brand.id)]);
  const urls = [
    `  <url><loc>${base}/${brand.slug}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...categories.map((c) => `  <url><loc>${base}/${brand.slug}/${esc(c.slug)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`),
    ...products.map(
      (p) =>
        `  <url><loc>${base}/${brand.slug}/${esc(p.categorySlug ?? "produto")}/${esc(p.slug)}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod><priority>0.6</priority></url>`,
    ),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

export const dynamic = "force-dynamic";

import { getActiveBrands } from "@/server/services/brands";
import { getOrigin } from "@/server/request";

/** Índice de sitemaps: um por marca (§33). */
export async function GET() {
  const base = process.env.SITE_URL ?? (await getOrigin());
  const brands = await getActiveBrands();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${brands.map((b) => `  <sitemap><loc>${base}/${b.slug}/sitemap.xml</loc></sitemap>`).join("\n")}
</sitemapindex>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

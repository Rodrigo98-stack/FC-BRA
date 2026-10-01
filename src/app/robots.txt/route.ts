import { getOrigin } from "@/server/request";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.SITE_URL ?? (await getOrigin());
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api",
    "Disallow: /*/carrinho",
    "Disallow: /*/checkout",
    "Disallow: /*/pedido",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

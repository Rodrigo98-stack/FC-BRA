import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrandBySlug } from "@/server/services/brands";
import { trackPublicEvent } from "@/server/services/analytics";
import { rateLimit } from "@/server/rate-limit";
import { getRequestMeta } from "@/server/request";

const schema = z.object({
  brand: z.string().max(60),
  type: z.enum(["page_view", "product_view", "add_to_cart", "begin_checkout"]),
  productId: z.string().uuid().optional(),
  visitorId: z.string().max(80).optional(),
  path: z.string().max(300).optional(),
});

/** Coleta anônima de eventos do funil (§31). Pedidos são registrados no servidor. */
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
    const meta = await getRequestMeta();
    await rateLimit(`events:${meta.ip ?? "anon"}`, 120, 60);
    const brand = await getBrandBySlug(parsed.data.brand);
    if (!brand) return NextResponse.json({ ok: false }, { status: 404 });
    await trackPublicEvent({
      brandId: brand.id,
      type: parsed.data.type,
      productId: parsed.data.productId ?? null,
      visitorId: parsed.data.visitorId ?? null,
      path: parsed.data.path ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}

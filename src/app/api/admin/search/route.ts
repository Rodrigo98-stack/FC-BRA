import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getAuth } from "@/server/auth/session";
import { getDb, rowsOf } from "@/server/db";
import { brandScope, can } from "@/server/rbac";
import { brandSql, likeTerm } from "@/server/sql";
import { formatBRL, orderCode } from "@/lib/format";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/domain";

/** Busca global do painel (§34), respeitando permissões e escopo de marca. */
export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ hits: [] }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const db = await getDb();
  const term = likeTerm(q);
  const hits: { type: string; label: string; detail?: string; href: string }[] = [];

  if (can(auth.perms, "produtos", "visualizar")) {
    const rows = rowsOf<{ id: string; name: string; sku: string; brand: string }>(
      await db.execute(sql`select p.id, p.name, p.sku, b.name as brand from public.products p join public.brands b on b.id = p.brand_id
        where p.deleted_at is null and ${brandSql(sql`p.brand_id`, brandScope(auth.perms, "produtos"))}
          and (p.name ilike ${term} or p.sku ilike ${term}) order by p.name limit 6`),
    );
    rows.forEach((r) => hits.push({ type: "Produto", label: r.name, detail: `${r.sku} · ${r.brand}`, href: `/admin/produtos/${r.id}` }));
  }
  if (can(auth.perms, "pedidos", "visualizar")) {
    const digits = q.replace(/\D/g, "");
    const rows = rowsOf<{ id: string; number: number; prefix: string; customer_name: string; total: string; status: OrderStatus }>(
      await db.execute(sql`select o.id, o.number, b.order_prefix as prefix, o.customer_name, o.total, o.status
        from public.orders o join public.brands b on b.id = o.brand_id
        where o.deleted_at is null and ${brandSql(sql`o.brand_id`, brandScope(auth.perms, "pedidos"))}
          and (o.customer_name ilike ${term} or o.customer_phone ilike ${term} ${digits ? sql`or o.number = ${Number(digits)}` : sql``})
        order by o.created_at desc limit 6`),
    );
    rows.forEach((r) =>
      hits.push({
        type: "Pedido",
        label: `#${orderCode(r.prefix, r.number)} · ${r.customer_name}`,
        detail: `${formatBRL(r.total)} · ${ORDER_STATUS_LABELS[r.status]}`,
        href: `/admin/pedidos/${r.id}`,
      }),
    );
  }
  if (can(auth.perms, "clientes", "visualizar")) {
    const rows = rowsOf<{ id: string; name: string; phone: string | null }>(
      await db.execute(sql`select id, name, phone from public.customers where deleted_at is null
        and (name ilike ${term} or coalesce(phone, '') ilike ${term} or coalesce(email, '') ilike ${term}) order by name limit 5`),
    );
    rows.forEach((r) => hits.push({ type: "Cliente", label: r.name, detail: r.phone ?? undefined, href: `/admin/clientes/${r.id}` }));
  }
  return NextResponse.json({ hits });
}

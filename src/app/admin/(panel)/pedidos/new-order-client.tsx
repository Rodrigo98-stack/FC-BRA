"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { BR_STATES, PAYMENT_METHOD_LABELS } from "@/lib/domain";
import { parseDecimal } from "@/lib/decimal";
import { btn, cx } from "@/components/admin/ui";
import { toast } from "@/components/admin/client";
import { createPanelOrderAction, searchVariantsAction } from "./actions";

type Variant = { id: string; product_name: string; sku: string; size: string | null; color: string | null; price: string; stock: number };
type Line = Variant & { quantity: number };

export function NewOrderForm({ brands, defaultBrandId }: { brands: { id: string; name: string }[]; defaultBrandId: string | null }) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(defaultBrandId ?? (brands.length === 1 ? brands[0].id : ""));
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Variant[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const key = useRef("");
  useEffect(() => {
    key.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    setLines([]);
    setResults([]);
  }, [brandId]);

  useEffect(() => {
    if (!brandId || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchVariantsAction(brandId, q).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, brandId]);

  const subtotal = lines.reduce((a, l) => a + Number(l.price) * l.quantity, 0);
  const disc = Math.min(Math.max(parseDecimal(discount) || 0, 0), subtotal);

  function add(v: Variant) {
    setLines((ls) => {
      const found = ls.find((l) => l.id === v.id);
      if (found) return ls.map((l) => (l.id === v.id ? { ...l, quantity: Math.min(l.quantity + 1, v.stock) } : l));
      return [...ls, { ...v, quantity: 1 }];
    });
    setQ("");
    setResults([]);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const customer: Record<string, string> = {};
    for (const k of ["name", "phone", "whatsapp", "email", "address", "city", "state", "zip", "notes"]) customer[k] = String(fd.get(k) ?? "").trim();
    setErrors({});
    start(async () => {
      const res = await createPanelOrderAction({
        brandId,
        items: lines.map((l) => ({ variantId: l.id, quantity: l.quantity })),
        customer,
        paymentMethod: String(fd.get("paymentMethod") ?? "") || null,
        discount: disc,
        whatsappOptIn: fd.get("optin") === "on",
        idempotencyKey: key.current,
      });
      if (res.ok) {
        toast("success", res.message ?? "Pedido registrado.");
        if (res.redirectTo) router.push(res.redirectTo);
      } else {
        setErrors(res.fieldErrors ?? {});
        toast("error", res.error);
      }
    });
  }

  const err = (k: string) => errors[k] ?? errors[`customer.${k}`];
  const input = (name: string, label: string, opts: { required?: boolean; type?: string; wide?: boolean } = {}) => (
    <label className={cx("block", opts.wide && "sm:col-span-2")}>
      <span className="admin-label">
        {label}
        {opts.required && <span className="text-red-700"> *</span>}
      </span>
      <input name={name} type={opts.type ?? "text"} className={cx("admin-input", err(name) && "border-red-400")} />
      {err(name) && <span className="mt-1 block text-xs text-red-700">{err(name)}</span>}
    </label>
  );

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-[15px] font-semibold">Itens</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr]">
            <label className="block">
              <span className="admin-label">Marca *</span>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="admin-input">
                <option value="">Escolha</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="relative">
              <label className="block">
                <span className="admin-label">Adicionar produto</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  disabled={!brandId}
                  placeholder={brandId ? "Busque por nome ou SKU" : "Escolha a marca primeiro"}
                  className="admin-input"
                />
              </label>
              {results.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg">
                  {results.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        disabled={v.stock <= 0}
                        onClick={() => add(v)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-stone-50 disabled:opacity-40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{v.product_name}</span>
                          <span className="text-xs text-stone-500">{[v.size, v.color, v.sku].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="shrink-0 text-right text-xs tabular-nums">
                          {formatBRL(v.price)}
                          <span className="block text-stone-500">{v.stock > 0 ? `${v.stock} em estoque` : "esgotado"}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {lines.length ? (
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="py-2 font-medium">Produto</th>
                  <th className="py-2 text-right font-medium">Qtd.</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-stone-100">
                    <td className="py-2">
                      {l.product_name}
                      <span className="block text-xs text-stone-500">{[l.size, l.color].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={1}
                        max={l.stock}
                        value={l.quantity}
                        onChange={(e) =>
                          setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, quantity: Math.max(1, Math.min(Number(e.target.value) || 1, l.stock)) } : x)))
                        }
                        className="admin-input w-20 py-1 text-right"
                        aria-label={`Quantidade de ${l.product_name}`}
                      />
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatBRL(Number(l.price) * l.quantity)}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="text-xs text-red-700 hover:underline">
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-5 rounded-md border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">Nenhum item adicionado.</p>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-[15px] font-semibold">Cliente</h2>
          <p className="mt-1 text-xs text-stone-500">Se o telefone já existir, o cadastro do cliente é atualizado.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {input("name", "Nome", { required: true, wide: true })}
            {input("phone", "Telefone", { required: true, type: "tel" })}
            {input("whatsapp", "WhatsApp (se diferente)", { type: "tel" })}
            {input("email", "E-mail", { type: "email" })}
            {input("zip", "CEP")}
            {input("address", "Endereço", { wide: true })}
            {input("city", "Cidade")}
            <label className="block">
              <span className="admin-label">UF</span>
              <select name="state" defaultValue="" className="admin-input">
                <option value="">—</option>
                {BR_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="admin-label">Observações</span>
              <textarea name="notes" rows={2} className="admin-input" />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="optin" className="h-4 w-4 accent-stone-900" /> Cliente autorizou receber mensagens no WhatsApp
            </label>
          </div>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="text-[15px] font-semibold">Resumo</h2>
        <label className="block">
          <span className="admin-label">Forma de pagamento</span>
          <select name="paymentMethod" defaultValue="" className="admin-input">
            <option value="">Não informado</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="admin-label">Desconto (R$)</span>
          <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0,00" className="admin-input" />
        </label>
        <dl className="space-y-1.5 border-t border-stone-100 pt-4 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-stone-500">Subtotal</dt>
            <dd>{formatBRL(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Desconto</dt>
            <dd>− {formatBRL(disc)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Frete</dt>
            <dd className="text-stone-500">conforme regra da marca</dd>
          </div>
          <div className="flex justify-between border-t border-stone-100 pt-2 font-semibold">
            <dt>Total (sem frete)</dt>
            <dd>{formatBRL(subtotal - disc)}</dd>
          </div>
        </dl>
        <button type="submit" disabled={pending || !lines.length || !brandId} className={cx(btn.base, btn.primary, "w-full")}>
          {pending ? "Registrando…" : "Registrar pedido"}
        </button>
        <p className="text-xs text-stone-500">O pedido entra como “Pedido recebido”. O estoque só é baixado quando você confirmar o pedido.</p>
      </aside>
    </form>
  );
}

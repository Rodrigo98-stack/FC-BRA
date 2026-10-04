"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { useCart, type CartItem } from "@/store/cart";
import { getVisitorId, track } from "@/lib/visitor";
import { placeOrder, quoteCart, type Quote } from "@/app/[brand]/actions";
import { SmartImage } from "./ui";

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Cotação no servidor sempre que o carrinho muda. */
function useQuote(brand: string, items: CartItem[]) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = items.map((i) => `${i.variantId}:${i.quantity}`).join(",");
  useEffect(() => {
    let cancelled = false;
    if (!items.length) {
      setQuote(null);
      return;
    }
    quoteCart(
      brand,
      items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    ).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setQuote(res.data);
        setError(null);
      } else if (!res.ok) setError(res.error);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, key]);
  return { quote, error };
}

function LineSummary({ item, line }: { item: CartItem; line?: Quote["lines"][number] }) {
  const variant = [item.size && `Tamanho ${item.size}`, item.color].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <p className="text-[15px] leading-snug">{item.name}</p>
      {variant && <p className="muted mt-1 text-sm">{variant}</p>}
      {line && !line.available && (
        <p className="mt-1 text-sm" style={{ color: "var(--brand-accent)" }}>
          {line.stock > 0 ? `Disponível: ${line.stock} unidade(s). Ajuste a quantidade.` : "Indisponível no momento."}
        </p>
      )}
    </div>
  );
}

export function CartView({ brand }: { brand: string }) {
  const mounted = useMounted();
  const items = useCart((s) => s.carts[brand]) ?? [];
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const { quote, error } = useQuote(brand, mounted ? items : []);

  if (!mounted) return <div className="min-h-[40vh]" />;
  if (!items.length) {
    return (
      <div className="py-24 text-center">
        <p className="font-display text-4xl">Seu carrinho está vazio</p>
        <p className="muted mt-3 text-sm">Explore a coleção e adicione os produtos que quiser.</p>
        <Link href={`/${brand}`} className="btn-brand mt-8">Continuar comprando</Link>
      </div>
    );
  }
  const lineFor = (id: string) => quote?.lines.find((l) => l.variantId === id);
  const blocked = quote?.lines.some((l) => !l.available) ?? true;

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16">
      <ul className="divide-y hairline border-y hairline">
        {items.map((item) => {
          const line = lineFor(item.variantId);
          const unit = line?.price ?? item.price;
          return (
            <li key={item.variantId} className="grid grid-cols-[88px_1fr] gap-5 py-6 sm:grid-cols-[110px_1fr_auto]">
              <Link href={`/${brand}/${item.categorySlug}/${item.slug}`} className="relative block aspect-[4/5] overflow-hidden bg-brand-secondary">
                {item.image && <SmartImage src={item.image} alt={item.name} sizes="110px" />}
              </Link>
              <div className="flex min-w-0 flex-col justify-between gap-4">
                <LineSummary item={item} line={line} />
                <div className="flex items-center gap-5 text-sm">
                  <div className="flex items-center border hairline">
                    <button type="button" className="px-3 py-1.5" onClick={() => setQuantity(brand, item.variantId, item.quantity - 1)} aria-label={`Diminuir quantidade de ${item.name}`}>−</button>
                    <span className="w-7 text-center tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      className="px-3 py-1.5 disabled:opacity-30"
                      disabled={line ? item.quantity >= line.stock : false}
                      onClick={() => setQuantity(brand, item.variantId, item.quantity + 1)}
                      aria-label={`Aumentar quantidade de ${item.name}`}
                    >
                      +
                    </button>
                  </div>
                  <button type="button" className="muted underline underline-offset-4 hover:opacity-100" onClick={() => remove(brand, item.variantId)}>
                    Remover
                  </button>
                </div>
              </div>
              <div className="col-span-2 flex justify-between text-sm tabular-nums sm:col-span-1 sm:flex-col sm:items-end sm:justify-start sm:gap-1">
                <span className="muted">{formatBRL(unit)} cada</span>
                <span className="text-[15px]">{formatBRL(unit * item.quantity)}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="h-fit border hairline p-6 lg:sticky lg:top-28">
        <h2 className="font-display text-2xl">Resumo</h2>
        <dl className="mt-6 space-y-3 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="muted">Subtotal</dt>
            <dd>{quote ? formatBRL(quote.subtotal) : "…"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">Frete</dt>
            <dd>{quote ? quote.shipping.label : "…"}</dd>
          </div>
          {quote?.shippingNotes && <p className="muted text-xs">{quote.shippingNotes}</p>}
          <div className="flex justify-between border-t hairline pt-4 text-base">
            <dt>Total</dt>
            <dd>{quote ? formatBRL(quote.total) : "…"}</dd>
          </div>
        </dl>
        {quote && !quote.shipping.known && <p className="muted mt-3 text-xs">O frete será combinado pelo WhatsApp ao confirmar o pedido.</p>}
        {error && <p className="mt-4 text-sm" role="alert" style={{ color: "var(--brand-accent)" }}>{error}</p>}
        <div className="mt-8 flex flex-col gap-3">
          {blocked ? (
            <span className="btn-brand cursor-not-allowed opacity-50" aria-disabled>
              Finalizar pedido
            </span>
          ) : (
            <Link href={`/${brand}/checkout`} className="btn-brand">Finalizar pedido</Link>
          )}
          <Link href={`/${brand}`} className="btn-brand-outline">Continuar comprando</Link>
        </div>
      </aside>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nome completo",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail (opcional)",
  address: "Endereço (rua, número, complemento, bairro)",
  city: "Cidade",
  state: "Estado (UF)",
  notes: "Observações",
};

export type PickupInfo = { address: string; mapsUrl: string | null; notes: string | null };
type Delivery = "entrega" | "retirada";

export function CheckoutView({
  brand,
  brandName,
  states,
  pickup,
}: {
  brand: string;
  brandName: string;
  states: string[];
  /** Retirada na loja ativa: o cliente escolhe entre retirar e receber. */
  pickup: PickupInfo | null;
}) {
  const mounted = useMounted();
  const router = useRouter();
  const items = useCart((s) => s.carts[brand]) ?? [];
  const clear = useCart((s) => s.clear);
  const { quote } = useQuote(brand, mounted ? items : []);
  const [sameWhatsapp, setSameWhatsapp] = useState(true);
  const [delivery, setDelivery] = useState<Delivery | null>(pickup ? null : "entrega");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef<string>("");
  const tracked = useRef(false);

  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    if (mounted && items.length && !tracked.current) {
      tracked.current = true;
      track({ brand, type: "begin_checkout" });
    }
  }, [mounted, items.length, brand]);

  const blocked = useMemo(() => !quote || quote.lines.some((l) => !l.available), [quote]);

  if (!mounted) return <div className="min-h-[40vh]" />;
  if (!items.length) {
    return (
      <div className="py-24 text-center">
        <p className="font-display text-4xl">Não há itens para finalizar</p>
        <Link href={`/${brand}`} className="btn-brand mt-8">Voltar à loja</Link>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const customer: Record<string, string> = {};
    for (const k of Object.keys(FIELD_LABELS)) customer[k] = String(fd.get(k) ?? "").trim();
    if (sameWhatsapp) customer.whatsapp = customer.phone;
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const res = await placeOrder(brand, {
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        customer,
        whatsappOptIn: fd.get("optin") === "on",
        idempotencyKey: idempotencyKey.current,
        visitorId: getVisitorId(),
        delivery,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
        return;
      }
      clear(brand);
      router.push(res.data!.redirectTo);
    });
  }

  const field = (name: string, opts: { type?: string; autoComplete?: string; required?: boolean; className?: string; inputMode?: "numeric" | "tel" | "email" } = {}) => (
    <div className={opts.className}>
      <label htmlFor={`c-${name}`} className="mb-1.5 block text-sm">
        {FIELD_LABELS[name]}
      </label>
      <input
        id={`c-${name}`}
        name={name}
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        autoComplete={opts.autoComplete}
        required={opts.required}
        aria-invalid={!!errors[name] || errors[`customer.${name}`] ? true : undefined}
        aria-describedby={errors[name] ? `e-${name}` : undefined}
        className="store-input"
      />
      {(errors[name] || errors[`customer.${name}`]) && (
        <p id={`e-${name}`} className="mt-1 text-xs" style={{ color: "var(--brand-accent)" }}>
          {errors[name] ?? errors[`customer.${name}`]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-12 lg:grid-cols-[1fr_380px] lg:gap-16" noValidate>
      <div className="space-y-10">
        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="font-display mb-6 text-2xl">Seus dados</legend>
          {field("name", { autoComplete: "name", required: true, className: "sm:col-span-2" })}
          {field("phone", { type: "tel", inputMode: "tel", autoComplete: "tel", required: true })}
          {field("email", { type: "email", inputMode: "email", autoComplete: "email" })}
          <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
            <input type="checkbox" checked={sameWhatsapp} onChange={(e) => setSameWhatsapp(e.target.checked)} className="accent-[var(--brand-text)]" />
            O telefone também é WhatsApp
          </label>
          {!sameWhatsapp && field("whatsapp", { type: "tel", inputMode: "tel", required: true, className: "sm:col-span-2" })}
        </fieldset>
        <fieldset className="space-y-5">
          <legend className="font-display mb-6 text-2xl">Entrega</legend>
          {pickup && (
            <div className="grid gap-3 sm:grid-cols-2">
              <DeliveryOption
                checked={delivery === "retirada"}
                onSelect={() => setDelivery("retirada")}
                title="Retirar na loja"
              >
                <span className="block">{pickup.address}</span>
                {pickup.notes && <span className="mt-1 block">{pickup.notes}</span>}
                <span className="mt-2 block" style={{ color: "var(--brand-accent)" }}>Sem custo de frete</span>
              </DeliveryOption>
              <DeliveryOption checked={delivery === "entrega"} onSelect={() => setDelivery("entrega")} title="Receber no meu endereço">
                <span className="block">Informe o endereço, a cidade e o estado.</span>
              </DeliveryOption>
            </div>
          )}
          {errors.delivery && (
            <p className="text-xs" role="alert" style={{ color: "var(--brand-accent)" }}>
              Escolha retirar na loja ou receber no seu endereço.
            </p>
          )}
          {delivery === "retirada" && pickup?.mapsUrl && (
            <a href={pickup.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sm underline underline-offset-4">
              Ver a loja no mapa
            </a>
          )}
          {delivery === "entrega" && (
            <div className="grid gap-5 sm:grid-cols-6">
              {field("address", { autoComplete: "street-address", required: true, className: "sm:col-span-6" })}
              {field("city", { autoComplete: "address-level2", required: true, className: "sm:col-span-4" })}
              <div className="sm:col-span-2">
                <label htmlFor="c-state" className="mb-1.5 block text-sm">{FIELD_LABELS.state}</label>
                <select id="c-state" name="state" required defaultValue="" className="store-input" aria-invalid={!!errors.state || undefined}>
                  <option value="" disabled style={{ color: "#111" }}>UF</option>
                  {states.map((s) => (
                    <option key={s} value={s} style={{ color: "#111" }}>{s}</option>
                  ))}
                </select>
                {errors.state && <p className="mt-1 text-xs" style={{ color: "var(--brand-accent)" }}>{errors.state}</p>}
              </div>
            </div>
          )}
          <div>
            <label htmlFor="c-notes" className="mb-1.5 block text-sm">{FIELD_LABELS.notes}</label>
            <textarea id="c-notes" name="notes" rows={3} maxLength={1000} className="store-input" />
          </div>
        </fieldset>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="optin" className="mt-0.5 accent-[var(--brand-text)]" />
          <span className="muted">Aceito receber pelo WhatsApp atualizações sobre este pedido (pagamento, envio e entrega).</span>
        </label>
      </div>

      <aside className="h-fit border hairline p-6 lg:sticky lg:top-28">
        <h2 className="font-display text-2xl">Seu pedido na {brandName}</h2>
        <ul className="mt-6 space-y-4 text-sm">
          {items.map((i) => {
            const line = quote?.lines.find((l) => l.variantId === i.variantId);
            return (
              <li key={i.variantId} className="flex justify-between gap-4">
                <span>
                  {i.quantity}× {i.name}
                  <span className="muted block text-xs">{[i.size, i.color].filter(Boolean).join(" · ")}</span>
                  {line && !line.available && <span className="block text-xs" style={{ color: "var(--brand-accent)" }}>Indisponível nesta quantidade</span>}
                </span>
                <span className="tabular-nums">{formatBRL((line?.price ?? i.price) * i.quantity)}</span>
              </li>
            );
          })}
        </ul>
        <dl className="mt-6 space-y-3 border-t hairline pt-5 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="muted">Subtotal</dt>
            <dd>{quote ? formatBRL(quote.subtotal) : "…"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">Frete</dt>
            <dd>{delivery === "retirada" ? "Retirada na loja" : (quote?.shipping.label ?? "…")}</dd>
          </div>
          <div className="flex justify-between border-t hairline pt-4 text-base">
            <dt>Total</dt>
            <dd>{quote ? formatBRL(delivery === "retirada" ? quote.subtotal : quote.total) : "…"}</dd>
          </div>
        </dl>
        {formError && (
          <p className="mt-5 text-sm" role="alert" style={{ color: "var(--brand-accent)" }}>
            {formError}
          </p>
        )}
        <button type="submit" disabled={pending || blocked} className="btn-brand mt-6 w-full">
          {pending ? "Gerando pedido…" : "Confirmar e enviar pelo WhatsApp"}
        </button>
        <p className="muted mt-4 text-xs leading-relaxed">
          Ao confirmar, o pedido é registrado e o WhatsApp abre com a mensagem pronta para você enviar à loja. Pagamento e frete são combinados na conversa.
        </p>
        {blocked && quote && (
          <Link href={`/${brand}/carrinho`} className="mt-4 inline-block text-sm underline underline-offset-4">
            Ajustar carrinho
          </Link>
        )}
      </aside>
    </form>
  );
}

/** Cartão de escolha da entrega (rádio acessível). */
function DeliveryOption({
  checked,
  onSelect,
  title,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className="flex cursor-pointer gap-3 border p-4 transition-colors"
      style={{
        borderColor: checked ? "var(--brand-accent)" : "color-mix(in srgb, var(--brand-text) 22%, transparent)",
        background: checked ? "color-mix(in srgb, var(--brand-accent) 10%, transparent)" : undefined,
      }}
    >
      <input type="radio" name="delivery" checked={checked} onChange={onSelect} className="mt-1 accent-[var(--brand-accent)]" />
      <span className="text-sm">
        <span className="block font-medium">{title}</span>
        <span className="muted mt-1 block">{children}</span>
      </span>
    </label>
  );
}

/** Abre o WhatsApp automaticamente uma única vez após o pedido. */
export function AutoOpenWhatsapp({ url, orderCode }: { url: string; orderCode: string }) {
  useEffect(() => {
    const key = `fcbra-wa-${orderCode}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    const t = setTimeout(() => {
      window.location.href = url;
    }, 1200);
    return () => clearTimeout(t);
  }, [url, orderCode]);
  return null;
}

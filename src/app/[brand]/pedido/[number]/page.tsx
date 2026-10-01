import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadStore } from "@/server/store-context";
import { getPublicOrder } from "@/server/services/orders";
import { verifySignature } from "@/server/secret";
import { formatBRL, orderCode, toNumber } from "@/lib/format";
import { AutoOpenWhatsapp } from "@/components/store/cart-client";

export const metadata: Metadata = { title: "Pedido recebido", robots: { index: false } };

type Props = { params: Promise<{ brand: string; number: string }>; searchParams: Promise<{ t?: string }> };

export default async function OrderConfirmation({ params, searchParams }: Props) {
  const { brand: slug, number } = await params;
  const { t } = await searchParams;
  const { brand } = await loadStore(slug);
  const n = Number(number);
  if (!Number.isSafeInteger(n) || n <= 0) notFound();
  const data = await getPublicOrder(brand.id, n);
  // A página só abre com a assinatura gerada no checkout (protege os dados do cliente).
  if (!data || !(await verifySignature(data.order.id, t))) notFound();
  const { order, items } = data;
  const code = orderCode(brand.orderPrefix, order.number);
  const firstName = order.customerName.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl px-5 pt-14 lg:pt-20">
      <p className="muted text-sm">Pedido #{code}</p>
      <h1 className="font-display mt-3 text-5xl leading-[1.02] lg:text-6xl">Obrigado, {firstName}. Seu pedido foi registrado.</h1>

      {order.whatsappUrl ? (
        <div className="mt-10 border hairline p-6 sm:p-8">
          <p className="text-[15px] leading-relaxed">
            Para concluir, envie a mensagem pronta pelo WhatsApp. A loja confirma disponibilidade, frete e forma de pagamento na conversa.
          </p>
          <a href={order.whatsappUrl} className="btn-brand mt-6" rel="noopener noreferrer">
            Abrir WhatsApp e enviar pedido
          </a>
          <p className="muted mt-4 text-xs">O WhatsApp abre automaticamente em instantes. Se não abrir, use o botão acima.</p>
          <AutoOpenWhatsapp url={order.whatsappUrl} orderCode={code} />
        </div>
      ) : (
        <div className="mt-10 border hairline p-6 sm:p-8">
          <p className="text-[15px] leading-relaxed">
            Seu pedido foi salvo, mas o WhatsApp da loja ainda não foi configurado (configuração pendente). Guarde o número do pedido; a loja entrará em contato pelo telefone informado.
          </p>
        </div>
      )}

      <section className="mt-12">
        <h2 className="font-display text-2xl">Resumo</h2>
        <ul className="mt-5 divide-y hairline border-y hairline text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex justify-between gap-6 py-4">
              <span>
                {it.quantity}× {it.productName}
                <span className="muted block text-xs">{[it.size && `Tamanho ${it.size}`, it.color].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="tabular-nums">{formatBRL(it.total)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-2 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="muted">Subtotal</dt>
            <dd>{formatBRL(order.subtotal)}</dd>
          </div>
          {toNumber(order.discount) > 0 && (
            <div className="flex justify-between">
              <dt className="muted">Desconto</dt>
              <dd>− {formatBRL(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="muted">Frete</dt>
            <dd>{order.shippingLabel ?? formatBRL(order.shipping)}</dd>
          </div>
          <div className="flex justify-between border-t hairline pt-3 text-base">
            <dt>Total</dt>
            <dd>{formatBRL(order.total)}</dd>
          </div>
        </dl>
      </section>
      <Link href={`/${brand.slug}`} className="btn-brand-outline mt-12">Continuar comprando</Link>
    </div>
  );
}

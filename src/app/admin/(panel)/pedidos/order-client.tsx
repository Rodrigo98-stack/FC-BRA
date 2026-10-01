"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/action";
import { ORDER_STATUS_LABELS, STOCK_COMMITTED_STATUSES, REVENUE_STATUSES, type OrderStatus } from "@/lib/domain";
import { btn, cx } from "@/components/admin/ui";
import { toast, CopyBox } from "@/components/admin/client";
import { changeStatusAction, sendMessageAction } from "./actions";

export function StatusChanger({
  orderId,
  current,
  options,
  stockCommitted,
  revenueRegistered,
}: {
  orderId: string;
  current: OrderStatus;
  options: OrderStatus[];
  stockCommitted: boolean;
  revenueRegistered: boolean;
}) {
  const router = useRouter();
  const [next, setNext] = useState<OrderStatus | "">("");
  const [state, action, pending] = useActionState(
    changeStatusAction.bind(null, orderId) as (p: ActionResult<{ url: string | null }> | null, f: FormData) => Promise<ActionResult<{ url: string | null }>>,
    null,
  );
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast("success", state.message ?? "Status alterado.");
      setLink(state.data?.url ?? null);
      setNext("");
      router.refresh();
    } else toast("error", state.error);
  }, [state, router]);

  if (!options.length) {
    return <p className="text-sm text-stone-600">Pedido {ORDER_STATUS_LABELS[current].toLowerCase()}: não há mudanças de status possíveis.</p>;
  }
  const effects: string[] = [];
  if (next) {
    const commit = STOCK_COMMITTED_STATUSES.includes(next);
    const revenue = REVENUE_STATUSES.includes(next);
    if (!stockCommitted && commit) effects.push("vai baixar o estoque dos itens");
    if (stockCommitted && !commit) effects.push("vai devolver os itens ao estoque");
    if (!revenueRegistered && revenue) effects.push("vai lançar a receita no financeiro");
    if (revenueRegistered && !revenue) effects.push("vai lançar um estorno no financeiro");
  }
  const needsReason = next === "cancelado" || next === "devolvido";
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="admin-label">Novo status</span>
        <select name="status" value={next} onChange={(e) => setNext(e.target.value as OrderStatus)} className="admin-input">
          <option value="">Escolha</option>
          {options.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="admin-label">{needsReason ? "Motivo (obrigatório)" : "Observação (opcional)"}</span>
        <textarea name="note" rows={2} maxLength={500} className="admin-input" />
      </label>
      {effects.length > 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Esta mudança {effects.join(" e ")}.</p>}
      <button type="submit" disabled={!next || pending} className={cx(btn.base, needsReason ? btn.danger : btn.primary, "w-full")}>
        {pending ? "Aplicando…" : "Aplicar status"}
      </button>
      {link && (
        <div className="pt-2">
          <CopyBox value={link} label="Mensagem automática gerada (sem API): envie pelo link" />
          <a href={link} target="_blank" rel="noopener noreferrer" className={cx(btn.base, btn.secondary, "mt-2 w-full")}>
            Abrir WhatsApp
          </a>
        </div>
      )}
    </form>
  );
}

export function MessageButtons({
  orderId,
  templates,
  apiAvailable,
}: {
  orderId: string;
  templates: { key: string; label: string }[];
  apiAvailable: boolean;
}) {
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const router = useRouter();
  const run = (via: "link" | "api") =>
    start(async () => {
      const res = await sendMessageAction(orderId, key, via);
      if (res.ok) {
        toast("success", res.message ?? "Pronto.");
        setLink(res.data?.url ?? null);
        router.refresh();
      } else toast("error", res.error);
    });
  return (
    <div className="space-y-3">
      <select value={key} onChange={(e) => setKey(e.target.value)} className="admin-input">
        {templates.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run("link")} className={cx(btn.base, btn.secondary)}>
          Gerar link
        </button>
        <button
          type="button"
          disabled={pending || !apiAvailable}
          title={apiAvailable ? undefined : "API do WhatsApp não configurada para esta marca"}
          onClick={() => run("api")}
          className={cx(btn.base, btn.secondary)}
        >
          Enviar pela API
        </button>
      </div>
      {!apiAvailable && <p className="text-xs text-stone-500">API não configurada: as mensagens são geradas como link para envio manual.</p>}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className={cx(btn.base, btn.primary, "w-full")}>
          Abrir WhatsApp com a mensagem
        </a>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { parseDecimal } from "@/lib/decimal";
import { formatBRL } from "@/lib/format";
import { MOVEMENT_LABELS, MANUAL_MOVEMENT_TYPES, type MovementType } from "@/lib/domain";
import { ActionForm, CheckboxField, FieldError, SubmitButton, TextAreaField, TextField } from "@/components/admin/client";
import type { ActionResult } from "@/server/action";
import { searchStockVariants } from "./actions";

type Found = { id: string; label: string; sku: string; stock: number; brandId: string; costPrice: string | null };

export function VariantPicker({ initial, onPick }: { initial?: Found | null; onPick?: (v: Found | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [picked, setPicked] = useState<Found | null>(initial ?? null);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => searchStockVariants(q).then(setResults).catch(() => setResults([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <input type="hidden" name="variantId" value={picked?.id ?? ""} />
      <label className="admin-label">
        Produto / variação <span className="text-red-700">*</span>
      </label>
      {picked ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium">{picked.label}</span>
            <span className="text-xs text-stone-500">
              {picked.sku} · saldo atual: {picked.stock}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              setPicked(null);
              onPick?.(null);
            }}
            className="text-xs text-stone-600 underline"
          >
            Trocar
          </button>
        </div>
      ) : (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque por nome, SKU, cor ou tamanho" className="admin-input" />
      )}
      {!picked && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setPicked(r);
                  setQ("");
                  onPick?.(r);
                }}
                className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-stone-50"
              >
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-stone-500">
                  {r.sku} · {r.stock} un.
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <FieldError name="variantId" />
    </div>
  );
}

export function MovementForm({ action, initial }: { action: (p: ActionResult | null, f: FormData) => Promise<ActionResult>; initial: Found | null }) {
  const [type, setType] = useState<MovementType | "transferencia">("entrada");
  const [picked, setPicked] = useState<Found | null>(initial);
  const signed = type === "ajuste";
  return (
    <ActionForm action={action} className="space-y-5">
      <VariantPicker initial={initial} onPick={setPicked} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="admin-label">Tipo de movimentação</span>
          <select name="type" value={type} onChange={(e) => setType(e.target.value as MovementType)} className="admin-input">
            {MANUAL_MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_LABELS[t]}
              </option>
            ))}
            <option value="transferencia">Transferência entre locais</option>
          </select>
        </label>
        {signed && (
          <label className="block">
            <span className="admin-label">Direção do ajuste</span>
            <select name="direction" className="admin-input" defaultValue="mais">
              <option value="mais">Somar ao estoque</option>
              <option value="menos">Subtrair do estoque</option>
            </select>
          </label>
        )}
        <TextField
          name="quantity"
          label={type === "inventario" ? "Quantidade contada (saldo real)" : "Quantidade"}
          type="number"
          inputMode="numeric"
          required
          help={type === "inventario" && picked ? `Saldo no sistema: ${picked.stock}. A diferença vira ajuste.` : undefined}
        />
        <TextField name="location" label={type === "transferencia" ? "Local de origem" : "Local"} placeholder="principal" help="Vazio = principal." />
        {type === "transferencia" && <TextField name="toLocation" label="Local de destino" required placeholder="Ex.: loja-centro" />}
      </div>
      <TextField name="reason" label="Motivo" required placeholder="Ex.: reposição, avaria, contagem mensal" />
      <TextAreaField name="notes" label="Observações" rows={2} />
      <SubmitButton>Registrar movimentação</SubmitButton>
    </ActionForm>
  );
}

export function EntryForm({
  action,
  suppliers,
  canRegisterExpense,
}: {
  action: (p: ActionResult | null, f: FormData) => Promise<ActionResult>;
  suppliers: { id: string; name: string; brandId: string | null }[];
  canRegisterExpense: boolean;
}) {
  const [picked, setPicked] = useState<Found | null>(null);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  useEffect(() => {
    if (picked?.costPrice && !cost) setCost(Number(picked.costPrice).toFixed(2).replace(".", ","));
  }, [picked, cost]);
  const total = (Number(qty) || 0) * (parseDecimal(cost) || 0);
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  return (
    <ActionForm action={action} className="space-y-5">
      <VariantPicker onPick={setPicked} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="admin-label">Fornecedor</span>
          <select name="supplierId" className="admin-input" defaultValue="">
            <option value="">Não informado</option>
            {suppliers
              .filter((s) => !picked || !s.brandId || s.brandId === picked.brandId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <TextField name="date" label="Data" type="date" required defaultValue={today} />
        <label className="block">
          <span className="admin-label">
            Quantidade <span className="text-red-700">*</span>
          </span>
          <input name="quantity" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="admin-input" />
          <FieldError name="quantity" />
        </label>
        <label className="block">
          <span className="admin-label">Custo unitário (R$)</span>
          <input name="unitCost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" className="admin-input" />
          <FieldError name="unitCost" />
        </label>
        <div className="rounded-md bg-stone-50 px-3 py-2.5 text-sm sm:col-span-2">
          Custo total: <strong className="tabular-nums">{total > 0 ? formatBRL(total) : "—"}</strong>
        </div>
        <TextField name="location" label="Local" placeholder="principal" />
      </div>
      <TextAreaField name="notes" label="Observação" rows={2} />
      {canRegisterExpense ? (
        <CheckboxField name="registerExpense" label="Lançar no financeiro como “Compra de produtos”" defaultChecked help="Cria uma saída no financeiro com o custo total." />
      ) : (
        <p className="text-xs text-stone-500">O lançamento no financeiro exige permissão do módulo Financeiro.</p>
      )}
      <SubmitButton>Registrar entrada</SubmitButton>
    </ActionForm>
  );
}

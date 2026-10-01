"use client";
import { useState } from "react";
import { FieldError } from "@/components/admin/client";

export function ColorField({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  const [v, setV] = useState(defaultValue);
  return (
    <label className="block">
      <span className="admin-label">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000"} onChange={(e) => setV(e.target.value)} className="h-9 w-10 cursor-pointer rounded border border-stone-300" aria-label={`${label} (seletor)`} />
        <input name={name} value={v} onChange={(e) => setV(e.target.value)} className="admin-input font-mono text-xs" maxLength={7} />
      </span>
      <FieldError name={name} />
    </label>
  );
}

export function PalettePreview({ colors, fonts, name }: { colors: Record<string, string>; fonts: { display: string; body: string }; name: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-stone-200" style={{ background: colors.background, color: colors.text }}>
      <div className="p-5">
        <p style={{ fontFamily: `"${fonts.display}", serif` }} className="text-3xl">
          {name}
        </p>
        <p style={{ fontFamily: `"${fonts.body}", sans-serif` }} className="mt-2 text-sm opacity-80">
          Prévia da tipografia e das cores atuais.
        </p>
        <span className="mt-4 inline-block px-4 py-2 text-xs tracking-[0.2em]" style={{ background: colors.text, color: colors.background }}>
          ENTRAR NA LOJA
        </span>
        <span className="ml-3 inline-block px-2 py-1 text-[10px]" style={{ background: colors.accent, color: colors.background }}>
          PROMOÇÃO
        </span>
      </div>
      <div className="flex h-3">
        {["primary", "secondary", "accent", "text", "background"].map((k) => (
          <span key={k} className="flex-1" style={{ background: colors[k] }} title={k} />
        ))}
      </div>
    </div>
  );
}

export function ShippingFields({ defaults }: { defaults: { mode: string; fixed_amount: number | null; free_over: number | null; notes: string | null } }) {
  const [mode, setMode] = useState(defaults.mode);
  const money = (v: number | null) => (v === null || v === undefined ? "" : Number(v).toFixed(2).replace(".", ","));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="admin-label">Regra</span>
        <select name="mode" value={mode} onChange={(e) => setMode(e.target.value)} className="admin-input">
          <option value="a_combinar">A combinar pelo WhatsApp (padrão)</option>
          <option value="gratis">Frete grátis</option>
          <option value="fixo">Valor fixo</option>
        </select>
      </label>
      {mode === "fixo" && (
        <>
          <label className="block">
            <span className="admin-label">Valor do frete (R$)</span>
            <input name="fixed_amount" defaultValue={money(defaults.fixed_amount)} inputMode="decimal" className="admin-input" />
            <FieldError name="fixed_amount" />
          </label>
          <label className="block">
            <span className="admin-label">Grátis acima de (R$)</span>
            <input name="free_over" defaultValue={money(defaults.free_over)} inputMode="decimal" placeholder="opcional" className="admin-input" />
          </label>
        </>
      )}
      <label className="block sm:col-span-2">
        <span className="admin-label">Observação exibida no carrinho</span>
        <input name="notes" defaultValue={defaults.notes ?? ""} placeholder="Ex.: entregas em até 5 dias úteis para a Grande SP" className="admin-input" />
      </label>
    </div>
  );
}

export function InstitutionalImages({ defaults }: { defaults: string[] }) {
  const [list, setList] = useState<string[]>(defaults.length ? defaults : [""]);
  return (
    <div className="space-y-2">
      <span className="admin-label">Imagens institucionais (links)</span>
      {list.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input name="institutional" value={v} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder="https://… ou /api/media/…" className="admin-input" />
          <button type="button" onClick={() => setList((l) => l.filter((_, j) => j !== i))} className="text-xs text-red-700">
            Remover
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setList((l) => [...l, ""])} className="text-xs text-stone-600 underline">
        Adicionar imagem
      </button>
      <p className="text-xs text-stone-500">Envie a imagem em Banners ou na galeria de um produto e cole o link aqui.</p>
    </div>
  );
}

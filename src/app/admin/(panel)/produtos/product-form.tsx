"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { slugify } from "@/lib/text";
import { parseDecimal } from "@/lib/decimal";
import { btn, cx } from "@/components/admin/ui";
import { toast } from "@/components/admin/client";
import { saveProductAction } from "./actions";

type Opt = { id: string; name: string };
type Category = { id: string; name: string; brandId: string; kind: string };
type Supplier = { id: string; name: string; brandId: string | null };

export type ProductFormValues = {
  brandId: string;
  categoryId: string;
  subcategoryId: string;
  name: string;
  sku: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  costPrice: string;
  salePrice: string;
  promoPrice: string;
  material: string;
  supplierId: string;
  minStock: string;
  videoUrl: string;
  status: "ativo" | "inativo" | "rascunho";
  isNew: boolean;
  isFeatured: boolean;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  images: { url: string; alt: string }[];
  variants: VariantRow[];
};

export type VariantRow = {
  key: string;
  id?: string;
  size: string;
  color: string;
  colorHex: string;
  sku: string;
  priceOverride: string;
  minStock: string;
  weightGrams: string;
  dimensions: string;
  imageUrl: string;
  isActive: boolean;
  initialStock: string;
  stock?: number;
};

const blankVariant = (): VariantRow => ({
  key: Math.random().toString(36).slice(2),
  size: "",
  color: "",
  colorHex: "",
  sku: "",
  priceOverride: "",
  minStock: "0",
  weightGrams: "",
  dimensions: "",
  imageUrl: "",
  isActive: true,
  initialStock: "",
});

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white">
      <header className="border-b border-stone-200 px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-stone-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-stone-500">{description}</p>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ProductForm({
  productId,
  initial,
  brands,
  categories,
  suppliers,
  canSetInitialStock,
  canEdit,
}: {
  productId: string | null;
  initial: ProductFormValues;
  brands: Opt[];
  categories: Category[];
  suppliers: Supplier[];
  canSetInitialStock: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<ProductFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ kind: "gallery" } | { kind: "variant"; key: string }>({ kind: "gallery" });
  const [gridSizes, setGridSizes] = useState("");
  const [gridColors, setGridColors] = useState("");

  const set = <K extends keyof ProductFormValues>(k: K, val: ProductFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const setVariant = (key: string, patch: Partial<VariantRow>) =>
    setV((s) => ({ ...s, variants: s.variants.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  const brandCategories = categories.filter((c) => c.brandId === v.brandId && c.kind === "padrao");
  const brandSuppliers = suppliers.filter((s) => !s.brandId || s.brandId === v.brandId);
  const price = parseDecimal(v.promoPrice) || parseDecimal(v.salePrice);
  const cost = parseDecimal(v.costPrice);
  const margin = Number.isFinite(cost) && price > 0 ? ((price - cost) / price) * 100 : null;
  const err = (k: string) => errors[k];

  const field = (k: keyof ProductFormValues, label: string, opts: { required?: boolean; placeholder?: string; inputMode?: "decimal" | "numeric"; help?: string; wide?: boolean } = {}) => (
    <label className={cx("block", opts.wide && "sm:col-span-2")}>
      <span className="admin-label">
        {label}
        {opts.required && <span className="text-red-700"> *</span>}
      </span>
      <input
        value={String(v[k] ?? "")}
        onChange={(e) => set(k, e.target.value as never)}
        placeholder={opts.placeholder}
        inputMode={opts.inputMode}
        disabled={!canEdit}
        className={cx("admin-input", err(k) && "border-red-400")}
      />
      {err(k) ? <span className="mt-1 block text-xs text-red-700">{err(k)}</span> : opts.help && <span className="mt-1 block text-xs text-stone-500">{opts.help}</span>}
    </label>
  );

  async function upload(file: File) {
    const target = uploadTarget.current;
    setUploading(target.kind === "gallery" ? "gallery" : target.key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!json.ok || !json.url) throw new Error(json.error ?? "Falha no envio.");
      if (target.kind === "gallery") setV((s) => ({ ...s, images: [...s.images, { url: json.url!, alt: s.name }] }));
      else setVariant(target.key, { imageUrl: json.url });
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function generateGrid() {
    const sizes = gridSizes.split(",").map((s) => s.trim()).filter(Boolean);
    const colors = gridColors.split(",").map((s) => s.trim()).filter(Boolean);
    if (!sizes.length && !colors.length) return toast("error", "Informe tamanhos e/ou cores separados por vírgula.");
    const base = v.sku || "SKU";
    const rows: VariantRow[] = [];
    for (const color of colors.length ? colors : [""]) {
      for (const size of sizes.length ? sizes : [""]) {
        const exists = v.variants.some((r) => r.size === size && r.color === color);
        if (exists) continue;
        rows.push({
          ...blankVariant(),
          size,
          color,
          sku: [base, size, color.slice(0, 3).toUpperCase()].filter(Boolean).join("-").replace(/\s+/g, ""),
        });
      }
    }
    setV((s) => ({ ...s, variants: [...s.variants.filter((r) => r.id || r.sku || r.size || r.color), ...rows] }));
    toast("info", `${rows.length} variação(ões) adicionada(s).`);
  }

  const payload = useMemo(
    () => ({
      brandId: v.brandId,
      categoryId: v.categoryId,
      subcategoryId: v.subcategoryId,
      name: v.name,
      sku: v.sku,
      slug: v.slug,
      shortDescription: v.shortDescription,
      longDescription: v.longDescription,
      costPrice: v.costPrice,
      salePrice: v.salePrice,
      promoPrice: v.promoPrice,
      material: v.material,
      supplierId: v.supplierId,
      minStock: v.minStock,
      videoUrl: v.videoUrl,
      status: v.status,
      isNew: v.isNew,
      isFeatured: v.isFeatured,
      tags: v.tags,
      seoTitle: v.seoTitle,
      seoDescription: v.seoDescription,
      images: v.images.filter((i) => i.url).map((i) => ({ url: i.url, alt: i.alt })),
      variants: v.variants.map((r) => ({
        id: r.id ?? "",
        size: r.size,
        color: r.color,
        colorHex: r.colorHex,
        sku: r.sku,
        priceOverride: r.priceOverride,
        minStock: r.minStock || "0",
        weightGrams: r.weightGrams,
        dimensions: r.dimensions,
        imageUrl: r.imageUrl,
        isActive: r.isActive,
        initialStock: r.id ? "" : r.initialStock,
      })),
    }),
    [v],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const res = await saveProductAction(productId, payload);
      if (res.ok) {
        toast("success", res.message ?? "Salvo.");
        if (res.redirectTo) router.push(res.redirectTo);
        router.refresh();
      } else {
        setErrors(res.fieldErrors ?? {});
        toast("error", res.error);
      }
    });
  }

  const variantErrors = Object.entries(errors).filter(([k]) => k.startsWith("variants"));

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Section title="Informações básicas">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="admin-label">Marca *</span>
                <select
                  value={v.brandId}
                  disabled={!!productId || !canEdit}
                  onChange={(e) => setV((s) => ({ ...s, brandId: e.target.value, categoryId: "", subcategoryId: "" }))}
                  className={cx("admin-input", err("brandId") && "border-red-400")}
                >
                  <option value="">Escolha</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {productId && <span className="mt-1 block text-xs text-stone-500">A marca de um produto não pode ser trocada.</span>}
                {err("brandId") && <span className="mt-1 block text-xs text-red-700">{err("brandId")}</span>}
              </label>
              <label className="block">
                <span className="admin-label">Categoria *</span>
                <select value={v.categoryId} disabled={!v.brandId || !canEdit} onChange={(e) => set("categoryId", e.target.value)} className={cx("admin-input", err("categoryId") && "border-red-400")}>
                  <option value="">{v.brandId ? "Escolha" : "Escolha a marca primeiro"}</option>
                  {brandCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {err("categoryId") && <span className="mt-1 block text-xs text-red-700">{err("categoryId")}</span>}
              </label>
              {field("name", "Nome do produto", { required: true, wide: true })}
              {field("sku", "SKU (código)", { required: true })}
              <label className="block">
                <span className="admin-label">Endereço na loja (slug)</span>
                <input
                  value={v.slug}
                  onChange={(e) => set("slug", e.target.value)}
                  placeholder={slugify(v.name) || "gerado do nome"}
                  disabled={!canEdit}
                  className={cx("admin-input", err("slug") && "border-red-400")}
                />
                <span className="mt-1 block text-xs text-stone-500">Vazio = gerado a partir do nome.</span>
              </label>
              <label className="block">
                <span className="admin-label">Subcategoria</span>
                <select value={v.subcategoryId} disabled={!v.brandId || !canEdit} onChange={(e) => set("subcategoryId", e.target.value)} className="admin-input">
                  <option value="">Nenhuma</option>
                  {brandCategories
                    .filter((c) => c.id !== v.categoryId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className="admin-label">Fornecedor</span>
                <select value={v.supplierId} disabled={!canEdit} onChange={(e) => set("supplierId", e.target.value)} className="admin-input">
                  <option value="">Não informado</option>
                  {brandSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {field("material", "Material", { placeholder: "Ex.: viscose, couro, algodão" })}
              {field("tags", "Palavras-chave (busca)", { placeholder: "separadas por espaço ou vírgula" })}
            </div>
          </Section>

          <Section title="Descrição">
            <div className="space-y-4">
              <label className="block">
                <span className="admin-label">Descrição curta</span>
                <input value={v.shortDescription} disabled={!canEdit} onChange={(e) => set("shortDescription", e.target.value)} maxLength={300} className="admin-input" />
              </label>
              <label className="block">
                <span className="admin-label">Descrição longa</span>
                <textarea value={v.longDescription} disabled={!canEdit} onChange={(e) => set("longDescription", e.target.value)} rows={6} className="admin-input" />
              </label>
              {field("videoUrl", "Vídeo (link, opcional)", { placeholder: "https://" })}
            </div>
          </Section>

          <Section title="Galeria de imagens" description="A primeira imagem é a capa. Use fotos verticais 4:5 (ex.: 1200×1500 px). WebP/AVIF são gerados automaticamente na loja.">
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {v.images.map((img, i) => (
                <li key={img.url + i} className="rounded-md border border-stone-200 p-2">
                  <div className="relative aspect-[4/5] overflow-hidden rounded bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt} className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 text-[10px] font-medium">Capa</span>}
                  </div>
                  <input
                    value={img.alt}
                    onChange={(e) => setV((s) => ({ ...s, images: s.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) }))}
                    placeholder="Texto alternativo"
                    aria-label="Texto alternativo da imagem"
                    className="admin-input mt-2 py-1 text-xs"
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <div className="mt-1.5 flex justify-between text-xs">
                      <span className="flex gap-2">
                        <button type="button" disabled={i === 0} onClick={() => setV((s) => { const im = [...s.images]; [im[i - 1], im[i]] = [im[i], im[i - 1]]; return { ...s, images: im }; })} className="text-stone-600 disabled:opacity-30" aria-label="Mover para a esquerda">←</button>
                        <button type="button" disabled={i === v.images.length - 1} onClick={() => setV((s) => { const im = [...s.images]; [im[i + 1], im[i]] = [im[i], im[i + 1]]; return { ...s, images: im }; })} className="text-stone-600 disabled:opacity-30" aria-label="Mover para a direita">→</button>
                      </span>
                      <button type="button" onClick={() => setV((s) => ({ ...s, images: s.images.filter((_, j) => j !== i) }))} className="text-red-700">
                        Remover
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {canEdit && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      uploadTarget.current = { kind: "gallery" };
                      fileRef.current?.click();
                    }}
                    className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-stone-300 text-sm text-stone-500 hover:border-stone-500 hover:text-stone-800"
                  >
                    {uploading === "gallery" ? "Enviando…" : "Adicionar imagem"}
                  </button>
                  <button
                    type="button"
                    className="mt-2 w-full text-xs text-stone-500 underline"
                    onClick={() => {
                      const url = window.prompt("Cole o endereço (https://) da imagem");
                      if (url && /^https?:\/\//.test(url)) setV((s) => ({ ...s, images: [...s.images, { url, alt: s.name }] }));
                    }}
                  >
                    ou colar link
                  </button>
                </li>
              )}
            </ul>
          </Section>

          <Section
            title="Variações"
            description="Cada variação tem SKU, estoque, preço e imagem próprios. O estoque de variações existentes muda apenas pelo módulo Estoque."
          >
            {canEdit && (
              <div className="mb-5 grid gap-3 rounded-md bg-stone-50 p-4 sm:grid-cols-[1fr_1fr_auto]">
                <label className="block">
                  <span className="admin-label">Tamanhos</span>
                  <input value={gridSizes} onChange={(e) => setGridSizes(e.target.value)} placeholder="P, M, G" className="admin-input" />
                </label>
                <label className="block">
                  <span className="admin-label">Cores</span>
                  <input value={gridColors} onChange={(e) => setGridColors(e.target.value)} placeholder="Preto, Off-white" className="admin-input" />
                </label>
                <button type="button" onClick={generateGrid} className={cx(btn.base, btn.secondary, "self-end")}>
                  Gerar combinações
                </button>
              </div>
            )}
            {variantErrors.length > 0 && (
              <ul className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
                {variantErrors.map(([k, m]) => {
                  const idx = Number(k.split(".")[1]);
                  return <li key={k}>{Number.isFinite(idx) ? `Variação ${idx + 1}: ${m}` : m}</li>;
                })}
              </ul>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-stone-500">
                    <th className="pb-2 pr-2 font-medium">Tamanho</th>
                    <th className="pb-2 pr-2 font-medium">Cor</th>
                    <th className="pb-2 pr-2 font-medium">Hex</th>
                    <th className="pb-2 pr-2 font-medium">SKU *</th>
                    <th className="pb-2 pr-2 font-medium">Preço próprio</th>
                    <th className="pb-2 pr-2 font-medium">Est. mín.</th>
                    <th className="pb-2 pr-2 font-medium">{productId ? "Estoque" : "Estoque inicial"}</th>
                    <th className="pb-2 pr-2 font-medium">Peso (g)</th>
                    <th className="pb-2 pr-2 font-medium">Dimensões</th>
                    <th className="pb-2 pr-2 font-medium">Imagem</th>
                    <th className="pb-2 pr-2 font-medium">Ativa</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {v.variants.map((r, i) => (
                    <tr key={r.key} className="border-t border-stone-100 align-top">
                      <td className="py-2 pr-2">
                        <input value={r.size} onChange={(e) => setVariant(r.key, { size: e.target.value })} className="admin-input w-20 py-1" aria-label={`Tamanho da variação ${i + 1}`} disabled={!canEdit} />
                      </td>
                      <td className="py-2 pr-2">
                        <input value={r.color} onChange={(e) => setVariant(r.key, { color: e.target.value })} className="admin-input w-28 py-1" aria-label={`Cor da variação ${i + 1}`} disabled={!canEdit} />
                      </td>
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-1">
                          <input
                            type="color"
                            value={r.colorHex || "#000000"}
                            onChange={(e) => setVariant(r.key, { colorHex: e.target.value })}
                            className="h-8 w-8 cursor-pointer rounded border border-stone-300"
                            aria-label={`Cor (hex) da variação ${i + 1}`}
                            disabled={!canEdit}
                          />
                          {r.colorHex && (
                            <button type="button" onClick={() => setVariant(r.key, { colorHex: "" })} className="text-[10px] text-stone-500" aria-label="Limpar cor">
                              ✕
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={r.sku}
                          onChange={(e) => setVariant(r.key, { sku: e.target.value })}
                          className={cx("admin-input w-40 py-1", errors[`variants.${i}.sku`] && "border-red-400")}
                          aria-label={`SKU da variação ${i + 1}`}
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input value={r.priceOverride} onChange={(e) => setVariant(r.key, { priceOverride: e.target.value })} inputMode="decimal" placeholder="—" className="admin-input w-24 py-1" aria-label="Preço próprio" disabled={!canEdit} />
                      </td>
                      <td className="py-2 pr-2">
                        <input value={r.minStock} onChange={(e) => setVariant(r.key, { minStock: e.target.value })} inputMode="numeric" className="admin-input w-16 py-1" aria-label="Estoque mínimo" disabled={!canEdit} />
                      </td>
                      <td className="py-2 pr-2">
                        {r.id ? (
                          <span className="inline-block py-1.5 tabular-nums">{r.stock ?? 0}</span>
                        ) : (
                          <input
                            value={r.initialStock}
                            onChange={(e) => setVariant(r.key, { initialStock: e.target.value })}
                            inputMode="numeric"
                            placeholder={canSetInitialStock ? "0" : "sem permissão"}
                            disabled={!canSetInitialStock || !canEdit}
                            className="admin-input w-20 py-1"
                            aria-label="Estoque inicial"
                          />
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <input value={r.weightGrams} onChange={(e) => setVariant(r.key, { weightGrams: e.target.value })} inputMode="numeric" className="admin-input w-20 py-1" aria-label="Peso em gramas" disabled={!canEdit} />
                      </td>
                      <td className="py-2 pr-2">
                        <input value={r.dimensions} onChange={(e) => setVariant(r.key, { dimensions: e.target.value })} placeholder="30×20×5 cm" className="admin-input w-28 py-1" aria-label="Dimensões" disabled={!canEdit} />
                      </td>
                      <td className="py-2 pr-2">
                        {r.imageUrl ? (
                          <span className="flex items-center gap-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                            {canEdit && (
                              <button type="button" onClick={() => setVariant(r.key, { imageUrl: "" })} className="text-[10px] text-stone-500">
                                ✕
                              </button>
                            )}
                          </span>
                        ) : (
                          canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                uploadTarget.current = { kind: "variant", key: r.key };
                                fileRef.current?.click();
                              }}
                              className="text-xs text-stone-600 underline"
                            >
                              {uploading === r.key ? "…" : "Enviar"}
                            </button>
                          )
                        )}
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <input type="checkbox" checked={r.isActive} onChange={(e) => setVariant(r.key, { isActive: e.target.checked })} className="mt-2 h-4 w-4 accent-stone-900" aria-label="Variação ativa" disabled={!canEdit} />
                      </td>
                      <td className="py-2 text-right">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setV((s) => ({ ...s, variants: s.variants.filter((x) => x.key !== r.key) }))}
                            className="mt-1.5 text-xs text-red-700"
                            title={r.id ? "A variação sai da loja; o histórico é mantido." : undefined}
                          >
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && (
              <button type="button" onClick={() => setV((s) => ({ ...s, variants: [...s.variants, blankVariant()] }))} className={cx(btn.base, btn.secondary, "mt-4")}>
                Adicionar variação
              </button>
            )}
            {productId && (
              <p className="mt-4 text-xs text-stone-500">
                Para dar entrada, ajustar ou fazer inventário, use <Link href={`/admin/estoque?produto=${productId}`} className="underline">Estoque</Link>.
              </p>
            )}
          </Section>

          <Section title="SEO" description="Título e descrição exibidos no Google e ao compartilhar o link.">
            <div className="grid gap-4">
              {field("seoTitle", "Título SEO", { placeholder: v.name })}
              {field("seoDescription", "Descrição SEO", { placeholder: v.shortDescription || "Até 160 caracteres" })}
            </div>
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="Publicação">
            <div className="space-y-4">
              <label className="block">
                <span className="admin-label">Status</span>
                <select value={v.status} disabled={!canEdit} onChange={(e) => set("status", e.target.value as ProductFormValues["status"])} className="admin-input">
                  <option value="rascunho">Rascunho (não aparece na loja)</option>
                  <option value="ativo">Ativo (à venda)</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={v.isNew} disabled={!canEdit} onChange={(e) => set("isNew", e.target.checked)} className="h-4 w-4 accent-stone-900" /> Marcar como novidade
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={v.isFeatured} disabled={!canEdit} onChange={(e) => set("isFeatured", e.target.checked)} className="h-4 w-4 accent-stone-900" /> Destaque na home
              </label>
            </div>
          </Section>
          <Section title="Preços">
            <div className="space-y-4">
              {field("salePrice", "Preço de venda (R$)", { required: true, inputMode: "decimal", placeholder: "0,00" })}
              {field("promoPrice", "Preço promocional (R$)", { inputMode: "decimal", placeholder: "—", help: "Preenchido = produto entra em Promoções." })}
              {field("costPrice", "Preço de custo (R$)", { inputMode: "decimal", placeholder: "—", help: "Usado para margem, CMV e DRE." })}
              <p className="rounded-md bg-stone-50 px-3 py-2 text-sm">
                Margem: <strong className="tabular-nums">{margin === null ? "Não informado" : `${margin.toFixed(1).replace(".", ",")}%`}</strong>
              </p>
              {field("minStock", "Estoque mínimo (produto)", { inputMode: "numeric", help: "Alerta de ESTOQUE BAIXO quando a variação chegar neste valor." })}
            </div>
          </Section>
        </aside>
      </div>
      {canEdit && (
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-4 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
          {Object.keys(errors).length > 0 && <p className="text-xs text-red-700">Revise os campos destacados.</p>}
          <button type="submit" disabled={pending} className={cx(btn.base, btn.primary)}>
            {pending ? "Salvando…" : productId ? "Salvar alterações" : "Cadastrar produto"}
          </button>
        </div>
      )}
    </form>
  );
}

"use client";
import { useMemo, useState } from "react";

/**
 * Gráficos do painel: série única (uma cor), colunas finas com topo
 * arredondado, grade discreta, tooltip ao passar o mouse e alternância
 * para tabela (acessibilidade).
 */
const INK = "#44403c";
const INK_HOVER = "#1c1917";
const GRID = "#e7e5e4";

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

export function ColumnChart({
  data,
  valueLabel,
  format,
  height = 220,
  emptyText = "Sem dados no período.",
}: {
  data: { key: string; label: string; value: number; detail?: string }[];
  valueLabel: string;
  format: "brl" | "int";
  height?: number;
  emptyText?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const fmt = useMemo(
    () =>
      format === "brl"
        ? (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v >= 1000 ? 0 : 2 })
        : (v: number) => v.toLocaleString("pt-BR"),
    [format],
  );
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const total = data.reduce((a, d) => a + d.value, 0);
  const W = 720;
  const padL = 64;
  const padB = 26;
  const padT = 12;
  const innerW = W - padL - 8;
  const innerH = height - padB - padT;
  const band = data.length ? innerW / data.length : innerW;
  const barW = Math.min(24, Math.max(3, band * 0.62));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  if (!data.length || total === 0) {
    return <p className="py-10 text-center text-sm text-stone-500">{emptyText}</p>;
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs text-stone-500 underline-offset-2 hover:underline">
          {asTable ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="py-1.5 font-medium">Data</th>
                <th className="py-1.5 text-right font-medium">{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-t border-stone-100">
                  <td className="py-1.5">{d.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={`${valueLabel} por dia`}>
            {ticks.map((t) => {
              const y = padT + innerH - (t / max) * innerH;
              return (
                <g key={t}>
                  <line x1={padL} x2={W - 8} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                  <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#78716c">
                    {fmt(t)}
                  </text>
                </g>
              );
            })}
            {data.map((d, i) => {
              const h = (d.value / max) * innerH;
              const x = padL + i * band + (band - barW) / 2;
              const y = padT + innerH - h;
              const r = Math.min(4, barW / 2, h);
              const path =
                h <= 0
                  ? ""
                  : `M${x},${padT + innerH} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${padT + innerH} Z`;
              return (
                <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={padL + i * band} y={padT} width={band} height={innerH} fill="transparent" />
                  {path && <path d={path} fill={hover === i ? INK_HOVER : INK} />}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="#78716c">
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs shadow-md"
              style={{ left: `${((padL + hover * band + band / 2) / W) * 100}%` }}
            >
              <p className="font-medium text-stone-900">{data[hover].label}</p>
              <p className="tabular-nums text-stone-700">
                {valueLabel}: {fmt(data[hover].value)}
              </p>
              {data[hover].detail && <p className="text-stone-500">{data[hover].detail}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Funil em barras horizontais (uma cor), com contagem e conversão por etapa. */
export function FunnelBars({
  steps,
}: {
  steps: { label: string; count: number; rateFromPrevious: number | null; rateFromStart: number | null }[];
}) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={s.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <span className="text-stone-700">{s.label}</span>
          <span className="relative h-5 rounded-sm bg-stone-100" title={`${s.count.toLocaleString("pt-BR")} — ${s.rateFromStart === null ? "" : `${s.rateFromStart.toFixed(1)}% do início`}`}>
            <span
              className="absolute inset-y-0 left-0 rounded-r-[4px] transition-colors"
              style={{ width: `${(s.count / max) * 100}%`, background: hover === i ? INK_HOVER : INK, minWidth: s.count ? 3 : 0 }}
            />
          </span>
          <span className="w-36 text-right tabular-nums text-stone-900">
            {s.count.toLocaleString("pt-BR")}
            <span className="ml-2 text-xs text-stone-500">
              {i === 0 ? "100%" : s.rateFromPrevious === null ? "—" : `${s.rateFromPrevious.toFixed(1)}%`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

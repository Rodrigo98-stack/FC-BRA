"use client";
import { useEffect } from "react";

export function PrintOnLoad() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="no-print mb-4 flex gap-2 text-sm">
      <button type="button" onClick={() => window.print()} className="rounded-md bg-stone-900 px-3 py-1.5 text-white">
        Imprimir / salvar PDF
      </button>
      <button type="button" onClick={() => history.back()} className="rounded-md border border-stone-300 px-3 py-1.5">
        Voltar
      </button>
    </div>
  );
}

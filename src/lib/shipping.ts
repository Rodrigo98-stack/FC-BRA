/** Regras de frete configuradas por marca no painel (§8.1 "quando configurado"). */
export type ShippingRule = {
  mode: "a_combinar" | "gratis" | "fixo";
  fixed_amount: number | null;
  free_over: number | null;
};

export function computeShipping(rule: ShippingRule, subtotal: number): { amount: number; label: string; known: boolean } {
  if (rule.mode === "gratis") return { amount: 0, label: "Grátis", known: true };
  if (rule.mode === "fixo" && rule.fixed_amount !== null && rule.fixed_amount !== undefined) {
    if (rule.free_over !== null && rule.free_over !== undefined && subtotal >= rule.free_over) {
      return { amount: 0, label: "Grátis", known: true };
    }
    const amount = Number(rule.fixed_amount);
    return {
      amount,
      label: amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " "),
      known: true,
    };
  }
  return { amount: 0, label: "A combinar", known: false };
}

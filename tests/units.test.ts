import { describe, expect, it } from "vitest";
import { resolvePeriod } from "@/lib/period";
import { computeShipping } from "@/lib/shipping";
import { parseDecimal } from "@/lib/decimal";
import { normalizePhone, slugify } from "@/lib/text";
import { renderTemplate, renderItems, waLink } from "@/server/services/whatsapp";
import { parsePolicy, policySummary } from "@/lib/text";
import { toCsv, toXlsx } from "@/server/export";
import { inflateRawSync } from "node:zlib";

describe("utilitários", () => {
  it("períodos no fuso de São Paulo", () => {
    const now = new Date("2026-10-01T02:00:00Z"); // 30/09 23h em SP
    const hoje = resolvePeriod("hoje", null, null, now);
    expect(hoje.fromDate).toBe("2026-09-30");
    expect(hoje.from.toISOString()).toBe("2026-09-30T03:00:00.000Z");
    const mes = resolvePeriod("mes", null, null, now);
    expect(mes.fromDate).toBe("2026-09-01");
    expect(mes.toDate).toBe("2026-09-30");
    const custom = resolvePeriod("personalizado", "2026-01-10", "2026-01-12", now);
    expect(custom.fromDate).toBe("2026-01-10");
    expect(custom.toDate).toBe("2026-01-12");
  });

  it("frete: a combinar, grátis, fixo e grátis acima de", () => {
    expect(computeShipping({ mode: "a_combinar", fixed_amount: null, free_over: null }, 100)).toMatchObject({ amount: 0, label: "A combinar", known: false });
    expect(computeShipping({ mode: "gratis", fixed_amount: null, free_over: null }, 100).label).toBe("Grátis");
    expect(computeShipping({ mode: "fixo", fixed_amount: 19.9, free_over: 300 }, 100).amount).toBe(19.9);
    expect(computeShipping({ mode: "fixo", fixed_amount: 19.9, free_over: 300 }, 350).amount).toBe(0);
  });

  it("números e textos pt-BR", () => {
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("R$ 99,9")).toBe(99.9);
    expect(normalizePhone("(81) 99876-5432")).toBe("5581998765432");
    expect(slugify("Calça Pantalona de Alfaiataria")).toBe("calca-pantalona-de-alfaiataria");
  });

  it("modelo de mensagem do WhatsApp (§9.2)", () => {
    const body = renderTemplate("Loja: {marca}\nPedido: #{numero}\nObservações: {obs}\n{desconhecida}", { marca: "BRAVUS", numero: "BR-000001", obs: null });
    expect(body).toBe("Loja: BRAVUS\nPedido: #BR-000001\nObservações: Não informado\n{desconhecida}");
    const items = renderItems([{ name: "Camisa", size: "M", color: "Azul", quantity: 2, total: 199.8 }]);
    expect(items).toContain("1. Camisa\n   Tamanho: M\n   Cor: Azul\n   Quantidade: 2\n   Valor: R$ 199,80");
    expect(waLink("55 11 91234-5678", "Olá & bem-vindo")).toBe("https://wa.me/5511912345678?text=Ol%C3%A1%20%26%20bem-vindo");
    expect(waLink(null, "x")).toBeNull();
  });

  it("exportação CSV (com proteção contra fórmula) e XLSX válido", () => {
    const csv = toCsv(["Nome", "Valor"], [["=HYPERLINK(1)", 10.5]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=HYPERLINK(1);10,5");
    const xlsx = toXlsx("Teste", ["A", "B"], [["x", 1]]);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    // lê o primeiro arquivo do zip e confere o conteúdo
    const nameLen = xlsx.readUInt16LE(26);
    const compSize = xlsx.readUInt32LE(18);
    const data = inflateRawSync(xlsx.subarray(30 + nameLen, 30 + nameLen + compSize)).toString();
    expect(data).toContain("spreadsheetml");
  });

  it("política: títulos, listas e parágrafos", () => {
    const blocks = parsePolicy("Intro\nem duas linhas\n\n## 1. Seção\n\nTexto da seção:\n• Item A;\n• Item B.\n\n- Item C");
    expect(blocks).toEqual([
      { type: "p", text: "Intro\nem duas linhas" },
      { type: "h", text: "1. Seção" },
      { type: "p", text: "Texto da seção:" },
      { type: "ul", items: ["Item A;", "Item B."] },
      { type: "ul", items: ["Item C"] },
    ]);
    expect(parsePolicy("   ")).toEqual([]);
    const s = policySummary("## Título\n\nUma frase bem longa que passa do limite de caracteres definido para o resumo.", 30);
    expect(s.length).toBeLessThanOrEqual(31);
    expect(s.endsWith("…")).toBe(true);
    expect(s).not.toContain("#");
  });
});

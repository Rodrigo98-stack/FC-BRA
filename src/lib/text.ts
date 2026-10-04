export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Mantém só dígitos; adiciona DDI 55 para números brasileiros (10–11 dígitos). */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function formatPhone(input: string | null | undefined): string {
  if (!input) return "";
  const d = input.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return input;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 2)}${"•".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export type PolicyBlock = { type: "h"; text: string } | { type: "p"; text: string } | { type: "ul"; items: string[] };

/**
 * Formatação simples dos textos de política (editados no painel como texto puro):
 * "## Título" vira título de seção; linhas com "• " ou "- " viram lista; o resto, parágrafos.
 * Linha em branco separa os blocos.
 */
export function parsePolicy(text: string): PolicyBlock[] {
  const blocks: PolicyBlock[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join("\n") });
    if (list.length) blocks.push({ type: "ul", items: list });
    para = [];
    list = [];
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ type: "h", text: line.slice(3).trim() });
    } else if (/^(•|-)\s+/.test(line)) {
      if (para.length) flush();
      list.push(line.replace(/^(•|-)\s+/, ""));
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** Resumo em uma linha de uma política (sem marcas de formatação), cortado em palavra inteira. */
export function policySummary(text: string, max = 260): string {
  const plain = text
    .replace(/^##\s+/gm, "")
    .replace(/^(•|-)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "")}…`;
}

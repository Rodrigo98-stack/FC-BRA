import { headers } from "next/headers";

export type RequestMeta = { ip: string | null; userAgent: string | null };

/** IP e user-agent da requisição atual (vazio fora de uma requisição). */
export async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers();
    const ip =
      h.get("x-nf-client-connection-ip") ??
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function getOrigin(): Promise<string> {
  const configured = process.env.SITE_URL ?? process.env.URL;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    /* fora de requisição */
  }
  return configured ?? "http://localhost:3000";
}

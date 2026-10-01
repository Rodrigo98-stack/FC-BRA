import { NextResponse, type NextRequest } from "next/server";

/**
 * Proteção de rotas do painel (§26). Sem cookie de sessão → login.
 * A sessão é validada de verdade no servidor a cada requisição
 * (src/server/auth/session.ts); aqui só barramos o acesso anônimo cedo.
 */
const PUBLIC_ADMIN = ["/admin/login", "/admin/setup", "/admin/convite/", "/admin/redefinir-senha/"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC_ADMIN.some((p) => pathname === p || pathname.startsWith(p));
  const hasSession = req.cookies.has("__Host-fcbra_session") || req.cookies.has("fcbra_session");
  if (pathname.startsWith("/api/admin/")) {
    if (!hasSession) return NextResponse.json({ ok: false, error: "Sessão expirada." }, { status: 401 });
    return NextResponse.next();
  }
  if (!isPublic && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };

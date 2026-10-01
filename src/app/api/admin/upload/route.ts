import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth/session";
import { saveUpload } from "@/server/storage";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { hasAnyPermission } from "@/server/rbac";

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth || !hasAnyPermission(auth.perms)) return NextResponse.json({ ok: false, error: "Sessão expirada." }, { status: 401 });
  // Proteção CSRF: só aceita envios da própria origem.
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ ok: false, error: "Origem inválida." }, { status: 403 });
  try {
    await rateLimit(`upload:${auth.user.id}`, 60, 600);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Nenhum arquivo enviado.");
    const url = await saveUpload(file);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const message = err instanceof AppError ? err.message : "Não foi possível enviar o arquivo.";
    if (!(err instanceof AppError)) console.error("[upload]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

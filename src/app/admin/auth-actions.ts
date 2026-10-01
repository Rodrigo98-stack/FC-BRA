"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, write } from "@/server/db";
import { runAction, formToObject, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { getRequestMeta } from "@/server/request";
import { createSession, destroyCurrentSession, requireActionAuth, revokeAllSessions } from "@/server/auth/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/crypto";
import { acceptInvitation, createOwner, hasOwner, resetPasswordWithToken } from "@/server/services/users";
import { audit } from "@/server/audit";
import { ADMIN_BRAND_COOKIE } from "@/server/admin";
import { zEmail, zRequired } from "@/server/validation";

// Hash fixo para comparar quando o e-mail não existe (tempo de resposta uniforme).
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function login(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { email, password, next } = z
      .object({ email: zEmail, password: z.string().min(1, "Informe a senha.").max(200), next: z.string().max(200).optional() })
      .parse(formToObject(form));
    const meta = await getRequestMeta();
    await rateLimit(`login:${meta.ip ?? "anon"}`, 20, 900);
    await rateLimit(`login:${email}`, 6, 900);

    const db = await getDb();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(sql`lower(${schema.users.email}) = ${email}`, isNull(schema.users.deletedAt)))
      .limit(1);
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AppError("E-mail ou senha incorretos.");
    if (user.status !== "ativo") {
      throw new AppError(
        user.status === "suspenso" ? "Seu acesso está suspenso. Fale com o administrador." : "Seu acesso não está ativo. Fale com o administrador.",
      );
    }
    await createSession(user.id);
    await write((tx) =>
      audit(tx, { id: user.id, fullName: user.fullName, email: user.email }, { action: "sessao.login", entity: "users", entityId: user.id }),
    );
    const target = next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
    return { ok: true, message: "Bem-vindo(a)!", redirectTo: target };
  });
}

export async function logout() {
  await destroyCurrentSession();
  redirect("/admin/login");
}

export async function setupOwner(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const data = z
      .object({
        fullName: zRequired("Nome", 160),
        email: zEmail,
        password: z.string().max(200),
        confirm: z.string().max(200),
        token: z.string().max(200).optional(),
      })
      .parse(formToObject(form));
    const meta = await getRequestMeta();
    await rateLimit(`setup:${meta.ip ?? "anon"}`, 10, 900);
    if (await hasOwner()) throw new AppError("O administrador principal já foi criado. Use a tela de login.");
    const expected = process.env.SETUP_TOKEN;
    if (process.env.NODE_ENV === "production" && !expected) {
      throw new AppError("Configuração pendente: defina a variável SETUP_TOKEN no ambiente (Netlify) para liberar o primeiro acesso.");
    }
    if (expected && data.token !== expected) throw new AppError("Código de instalação inválido.", "app_error", { token: "Código inválido." });
    if (data.password !== data.confirm) throw new AppError("As senhas não conferem.", "app_error", { confirm: "As senhas não conferem." });
    const user = await createOwner({ fullName: data.fullName, email: data.email, password: data.password });
    await createSession(user.id);
    return { ok: true, message: "Administrador principal criado.", redirectTo: "/admin" };
  });
}

export async function acceptInvite(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const data = z
      .object({
        token: z.string().min(10).max(200),
        fullName: zRequired("Nome", 160),
        phone: z.string().max(30).optional(),
        password: z.string().max(200),
        confirm: z.string().max(200),
      })
      .parse(formToObject(form));
    const meta = await getRequestMeta();
    await rateLimit(`invite:${meta.ip ?? "anon"}`, 10, 900);
    if (data.password !== data.confirm) throw new AppError("As senhas não conferem.", "app_error", { confirm: "As senhas não conferem." });
    const user = await acceptInvitation(data.token, { fullName: data.fullName, password: data.password, phone: data.phone || null });
    await createSession(user.id);
    return { ok: true, message: "Conta ativada.", redirectTo: "/admin" };
  });
}

export async function resetPassword(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const data = z
      .object({ token: z.string().min(10).max(200), password: z.string().max(200), confirm: z.string().max(200) })
      .parse(formToObject(form));
    const meta = await getRequestMeta();
    await rateLimit(`reset:${meta.ip ?? "anon"}`, 10, 900);
    if (data.password !== data.confirm) throw new AppError("As senhas não conferem.", "app_error", { confirm: "As senhas não conferem." });
    await resetPasswordWithToken(data.token, data.password);
    return { ok: true, message: "Senha definida. Entre com a nova senha.", redirectTo: "/admin/login" };
  });
}

export async function changeOwnPassword(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const data = z
      .object({ current: z.string().max(200), password: z.string().max(200), confirm: z.string().max(200) })
      .parse(formToObject(form));
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, auth.user.id));
    if (!(await verifyPassword(data.current, user?.passwordHash))) {
      throw new AppError("Senha atual incorreta.", "app_error", { current: "Senha atual incorreta." });
    }
    const problem = passwordProblem(data.password);
    if (problem) throw new AppError(problem, "app_error", { password: problem });
    if (data.password !== data.confirm) throw new AppError("As senhas não conferem.", "app_error", { confirm: "As senhas não conferem." });
    const passwordHash = await hashPassword(data.password);
    await write(async (tx) => {
      await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, auth.user.id));
      await audit(tx, { id: auth.user.id, fullName: auth.user.fullName, email: auth.user.email }, {
        action: "usuario.trocar_senha",
        entity: "users",
        entityId: auth.user.id,
      });
    });
    // Encerra as outras sessões e mantém a atual.
    await revokeAllSessions(auth.user.id);
    await createSession(auth.user.id);
    return { ok: true, message: "Senha alterada. Outras sessões foram encerradas." };
  });
}

export async function setAdminBrand(brandId: string | null) {
  const jar = await cookies();
  if (!brandId) jar.delete(ADMIN_BRAND_COOKIE);
  else if (/^[0-9a-f-]{36}$/.test(brandId)) {
    jar.set(ADMIN_BRAND_COOKIE, brandId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin" });
  }
}

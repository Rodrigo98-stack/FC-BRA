/**
 * Sessões do painel: token aleatório em cookie httpOnly/secure/sameSite;
 * no banco fica só o hash. Revogar um usuário apaga o acesso na próxima
 * requisição (a sessão é validada no banco a cada request — §35.8).
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, schema, write } from "../db";
import { loadPermissions, type PermissionSet } from "../rbac";
import { AppError } from "../errors";
import { getRequestMeta } from "../request";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-fcbra_session" : "fcbra_session";
const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 12);
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export type SessionUser = {
  id: string;
  fullName: string;
  nickname: string | null;
  email: string;
  photoUrl: string | null;
  isOwner: boolean;
  isDemo: boolean;
  jobTitle: string | null;
};

export type AuthContext = {
  user: SessionUser;
  sessionId: string;
  perms: PermissionSet;
};

export async function createSession(userId: string) {
  const token = randomToken();
  const meta = await getRequestMeta();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await write(async (tx) => {
    await tx.insert(schema.sessions).values({
      userId,
      tokenHash: sha256(token),
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    });
    await tx.update(schema.users).set({ lastAccessAt: new Date() }).where(eq(schema.users.id, userId));
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await write(async (tx) => {
      await tx
        .update(schema.sessions)
        .set({ revokedAt: new Date() })
        .where(eq(schema.sessions.tokenHash, sha256(token)));
    });
  }
  jar.delete(SESSION_COOKIE);
}

/** Invalida todas as sessões ativas de um usuário (revogação imediata). */
export async function revokeAllSessions(userId: string) {
  await write(async (tx) => {
    await tx
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
  });
}

/** Sessão atual validada no banco (memoizada por requisição). */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const db = await getDb();
  const { sessions, users } = schema;
  const rows = await db
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      user: {
        id: users.id,
        fullName: users.fullName,
        nickname: users.nickname,
        email: users.email,
        photoUrl: users.photoUrl,
        isOwner: users.isOwner,
        isDemo: users.isDemo,
        jobTitle: users.jobTitle,
        status: users.status,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row || row.user.status !== "ativo") return null;

  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await write(
      async (tx) => {
        await tx.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId));
        await tx.update(schema.users).set({ lastAccessAt: new Date() }).where(eq(users.id, row.user.id));
      },
      { persist: false },
    ).catch(() => {});
  }

  const { status: _status, ...user } = row.user;
  const perms = await loadPermissions(db, user.id, user.isOwner);
  return { user, sessionId: row.sessionId, perms };
});

/** Para páginas do painel: redireciona ao login se não houver sessão. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/admin/login");
  return auth;
}

/** Para server actions / route handlers: lança erro tratável. */
export async function requireActionAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new AppError("Sua sessão expirou. Entre novamente.", "unauthenticated");
  return auth;
}

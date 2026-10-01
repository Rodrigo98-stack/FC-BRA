import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema, write } from "./db";
import { randomToken } from "./auth/crypto";

let cached: string | null = null;

/**
 * Segredo da aplicação: APP_SECRET (recomendado em produção) ou, se ausente,
 * um segredo aleatório gerado uma única vez e guardado no banco.
 */
export async function getAppSecret(): Promise<string> {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  if (cached) return cached;
  const db = await getDb();
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "secret"));
  const existing = (row?.value as { value?: string } | undefined)?.value;
  if (existing) return (cached = existing);
  const value = randomToken(48);
  await write(async (tx) => {
    await tx.insert(schema.appSettings).values({ key: "secret", value: { value } }).onConflictDoNothing();
  });
  const [again] = await (await getDb()).select().from(schema.appSettings).where(eq(schema.appSettings.key, "secret"));
  return (cached = String((again?.value as { value?: string }).value));
}

export async function signValue(value: string): Promise<string> {
  return createHmac("sha256", await getAppSecret()).update(value).digest("base64url").slice(0, 32);
}

export async function verifySignature(value: string, signature: string | null | undefined): Promise<boolean> {
  if (!signature) return false;
  const expected = Buffer.from(await signValue(value));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

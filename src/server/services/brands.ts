import { requestCache } from "../cache";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Brand } from "../db/schema";

export const getBrands = requestCache(async (): Promise<Brand[]> => {
  const db = await getDb();
  return db.select().from(schema.brands).orderBy(asc(schema.brands.sortOrder));
});

export async function getActiveBrands() {
  return (await getBrands()).filter((b) => b.isActive);
}

export async function getBrandBySlug(slug: string) {
  return (await getBrands()).find((b) => b.slug === slug && b.isActive) ?? null;
}

export async function getBrandById(id: string | null | undefined) {
  if (!id) return null;
  return (await getBrands()).find((b) => b.id === id) ?? null;
}

export async function brandNameMap() {
  return new Map((await getBrands()).map((b) => [b.id, b] as const));
}

export async function setBrandActive(id: string, isActive: boolean) {
  const db = await getDb();
  await db.update(schema.brands).set({ isActive }).where(eq(schema.brands.id, id));
}

import { sql } from "drizzle-orm";
import { rowsOf, write } from "./db";
import { AppError } from "./errors";

/**
 * Rate limit em janela fixa, guardado no banco (vale entre instâncias
 * serverless). Lança AppError quando o limite é excedido.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const hits = await write(
    async (tx) => {
      const res = await tx.execute(sql`
        insert into public.rate_limits as r (key, hits, window_started_at)
        values (${key}, 1, now())
        on conflict (key) do update set
          hits = case when r.window_started_at < now() - make_interval(secs => ${windowSeconds}) then 1 else r.hits + 1 end,
          window_started_at = case when r.window_started_at < now() - make_interval(secs => ${windowSeconds}) then now() else r.window_started_at end
        returning hits`);
      const rows = rowsOf<{ hits: number }>(res);
      return Number(rows[0]?.hits ?? 0);
    },
    { persist: false },
  );
  if (hits > limit) {
    throw new AppError("Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.", "rate_limited");
  }
}

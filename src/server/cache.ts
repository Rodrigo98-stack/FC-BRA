import { cache } from "react";
import { inTransaction } from "./db";

/**
 * React cache() por requisição que é ignorado dentro de transações.
 * Evita (1) ler dados anteriores à transação e (2) deadlock na carga
 * inicial do banco, quando a própria inicialização chama funções cacheadas.
 */
export function requestCache<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const cached = cache(fn);
  return (...args: A): Promise<R> => (inTransaction() ? fn(...args) : cached(...args));
}

/**
 * Inicializa o banco quando o servidor sobe (fora do contexto de uma
 * requisição): migrations pendentes e, no modo demonstração, o snapshot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

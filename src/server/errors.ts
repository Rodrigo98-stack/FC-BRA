/** Erro com mensagem segura para exibir ao usuário (nunca stack trace). */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "app_error" | "forbidden" | "unauthenticated" | "not_found" | "conflict" | "rate_limited" = "app_error",
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "Você não tem permissão para esta ação.") => new AppError(msg, "forbidden");
export const notFound = (msg = "Registro não encontrado.") => new AppError(msg, "not_found");

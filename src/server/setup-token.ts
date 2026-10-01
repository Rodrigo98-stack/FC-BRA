/**
 * Código de instalação do primeiro acesso (/admin/setup).
 * Lido do ambiente em tempo de execução (SETUP_TOKEN) ou, em deploys sem
 * variáveis de ambiente, do valor injetado no build (next.config.ts →
 * FCBRA_SETUP_TOKEN). Só vale enquanto não existe administrador principal.
 */
export function getSetupToken(): string | null {
  return process.env.SETUP_TOKEN || process.env.FCBRA_SETUP_TOKEN || null;
}

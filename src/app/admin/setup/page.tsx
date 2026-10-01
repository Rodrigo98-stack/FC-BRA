import { redirect } from "next/navigation";
import { hasOwner } from "@/server/services/users";
import { getSetupToken } from "@/server/setup-token";
import { AuthShell } from "@/components/admin/auth-shell";
import { ActionForm, SubmitButton, TextField } from "@/components/admin/client";
import { setupOwner } from "../auth-actions";

export const metadata = { title: "Primeiro acesso" };

export default async function SetupPage() {
  if (await hasOwner()) redirect("/admin/login");
  const needsToken = !!getSetupToken() || process.env.NODE_ENV === "production";
  const tokenMissing = process.env.NODE_ENV === "production" && !getSetupToken();
  return (
    <AuthShell
      title="Primeiro acesso"
      description="Crie a conta do ADMINISTRADOR PRINCIPAL. Ela tem acesso total e não pode ser excluída nem rebaixada."
    >
      {tokenMissing ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Configuração pendente: defina a variável de ambiente <code>SETUP_TOKEN</code> no Netlify (Site configuration › Environment variables) e publique novamente. Depois volte a esta página e informe o código.
        </div>
      ) : (
        <ActionForm action={setupOwner} className="space-y-4" refresh={false}>
          {needsToken && <TextField name="token" label="Código de instalação (SETUP_TOKEN)" type="password" required autoComplete="off" />}
          <TextField name="fullName" label="Nome completo" required autoComplete="name" />
          <TextField name="email" label="E-mail" type="email" required autoComplete="username" />
          <TextField name="password" label="Senha" type="password" required autoComplete="new-password" help="Mínimo de 10 caracteres, com letras e números." />
          <TextField name="confirm" label="Confirme a senha" type="password" required autoComplete="new-password" />
          <SubmitButton className="w-full" pendingText="Criando…">
            Criar administrador principal
          </SubmitButton>
        </ActionForm>
      )}
    </AuthShell>
  );
}

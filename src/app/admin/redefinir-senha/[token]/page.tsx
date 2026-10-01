import Link from "next/link";
import { getPasswordReset } from "@/server/services/users";
import { AuthShell } from "@/components/admin/auth-shell";
import { ActionForm, SubmitButton, TextField } from "@/components/admin/client";
import { resetPassword } from "../../auth-actions";

export const metadata = { title: "Definir senha" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reset = await getPasswordReset(token);
  if (!reset) {
    return (
      <AuthShell title="Link expirado">
        <p className="text-sm text-stone-600">Este link de redefinição é inválido, já foi usado ou expirou. Peça um novo ao administrador.</p>
        <Link href="/admin/login" className="mt-6 inline-block text-sm underline">Ir para o login</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Definir nova senha" description={<>Conta: <strong>{reset.email}</strong></>}>
      <ActionForm action={resetPassword} className="space-y-4" refresh={false}>
        <input type="hidden" name="token" value={token} />
        <TextField name="password" label="Nova senha" type="password" required autoComplete="new-password" help="Mínimo de 10 caracteres, com letras e números." />
        <TextField name="confirm" label="Confirme a senha" type="password" required autoComplete="new-password" />
        <SubmitButton className="w-full" pendingText="Salvando…">
          Salvar senha
        </SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}

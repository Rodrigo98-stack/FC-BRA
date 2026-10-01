import Link from "next/link";
import { getInvitationByToken } from "@/server/services/users";
import { AuthShell } from "@/components/admin/auth-shell";
import { ActionForm, SubmitButton, TextField } from "@/components/admin/client";
import { INVITATION_STATUS_LABELS } from "@/lib/domain";
import { acceptInvite } from "../../auth-actions";

export const metadata = { title: "Aceitar convite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvitationByToken(token);
  if (!inv || inv.status !== "pendente") {
    return (
      <AuthShell title="Convite indisponível">
        <p className="text-sm text-stone-600">
          {inv ? `Este convite está ${INVITATION_STATUS_LABELS[inv.status]?.toLowerCase()}.` : "Link de convite inválido."} Peça um novo convite ao administrador.
        </p>
        <Link href="/admin/login" className="mt-6 inline-block text-sm underline">Ir para o login</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Ative sua conta" description={<>Convite para <strong>{inv.email}</strong>. Defina seu nome e sua senha.</>}>
      <ActionForm action={acceptInvite} className="space-y-4" refresh={false}>
        <input type="hidden" name="token" value={token} />
        <TextField name="fullName" label="Nome completo" required defaultValue={inv.fullName} autoComplete="name" />
        <TextField name="phone" label="Telefone (opcional)" type="tel" autoComplete="tel" />
        <TextField name="password" label="Senha" type="password" required autoComplete="new-password" help="Mínimo de 10 caracteres, com letras e números." />
        <TextField name="confirm" label="Confirme a senha" type="password" required autoComplete="new-password" />
        <SubmitButton className="w-full" pendingText="Ativando…">
          Ativar conta
        </SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}

import Link from "next/link";
import { getAdminContext } from "@/server/admin";
import { ActionForm, SubmitButton, TextField } from "@/components/admin/client";
import { PageHeader, Panel } from "@/components/admin/ui";
import { changeOwnPassword } from "../../auth-actions";

export const metadata = { title: "Minha conta" };

export default async function MyAccount() {
  const ctx = await getAdminContext();
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Minha conta" description={ctx.auth.user.email} />
      <Panel title="Trocar senha" description="Ao trocar a senha, suas outras sessões abertas são encerradas.">
        <ActionForm action={changeOwnPassword} className="space-y-4" resetOnSuccess>
          <TextField name="current" label="Senha atual" type="password" required autoComplete="current-password" />
          <TextField name="password" label="Nova senha" type="password" required autoComplete="new-password" help="Mínimo de 10 caracteres, com letras e números." />
          <TextField name="confirm" label="Confirme a nova senha" type="password" required autoComplete="new-password" />
          <SubmitButton>Trocar senha</SubmitButton>
        </ActionForm>
      </Panel>
      <Panel title="Meus dados">
        <Link href={`/admin/equipe/${ctx.auth.user.id}`} className="text-sm underline">
          Editar nome, telefone e foto
        </Link>
      </Panel>
    </div>
  );
}

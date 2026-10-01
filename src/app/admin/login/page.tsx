import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { hasOwner } from "@/server/services/users";
import { AuthShell } from "@/components/admin/auth-shell";
import { ActionForm, SubmitButton, TextField } from "@/components/admin/client";
import { login } from "../auth-actions";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getAuth()) redirect("/admin");
  if (!(await hasOwner())) redirect("/admin/setup");
  const { next } = await searchParams;
  return (
    <AuthShell title="Entrar no painel" description="Use o e-mail e a senha cadastrados pelo administrador.">
      <ActionForm action={login} className="space-y-4" refresh={false}>
        <input type="hidden" name="next" value={next ?? ""} />
        <TextField name="email" label="E-mail" type="email" autoComplete="username" required />
        <TextField name="password" label="Senha" type="password" autoComplete="current-password" required />
        <SubmitButton className="w-full" pendingText="Entrando…">
          Entrar
        </SubmitButton>
      </ActionForm>
      <p className="mt-5 text-xs text-stone-500">
        Esqueceu a senha? Peça ao administrador um link de redefinição. <Link href="/" className="underline">Ir para a loja</Link>
      </p>
    </AuthShell>
  );
}

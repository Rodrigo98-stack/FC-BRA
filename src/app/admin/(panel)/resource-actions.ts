"use server";
import { requireActionAuth } from "@/server/auth/session";
import { deleteResource, getResource, saveResource } from "@/server/resources";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";

const LIST_PATH: Record<string, string> = {
  fornecedores: "/admin/fornecedores",
  ideias: "/admin/ideias",
  planejados: "/admin/planejados",
  banners: "/admin/banners",
  categorias: "/admin/categorias",
  times: "/admin/equipe?aba=times",
  clientes: "/admin/clientes",
  receitas: "/admin/financeiro",
  despesas: "/admin/financeiro",
};

export async function saveResourceAction(key: string, id: string | null, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    const def = getResource(key);
    const saved = await saveResource(def, auth, id, formToObject(form));
    const base = LIST_PATH[key] ?? "/admin";
    return {
      ok: true,
      message: id ? "Alterações salvas." : `${def.singular.charAt(0).toUpperCase()}${def.singular.slice(1)} ${def.feminine ? "cadastrada" : "cadastrado"}.`,
      redirectTo: key === "clientes" && !id ? `/admin/clientes/${saved.id}` : base,
    };
  });
}

export async function deleteResourceAction(key: string, id: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await requireActionAuth();
    if (!reason || reason.length < 3) throw new AppError("Informe o motivo.");
    const def = getResource(key);
    await deleteResource(def, auth, id, reason);
    return { ok: true, message: "Registro excluído.", redirectTo: LIST_PATH[key] };
  });
}

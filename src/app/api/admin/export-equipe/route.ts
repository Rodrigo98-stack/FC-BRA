import { getAuth } from "@/server/auth/session";
import { can } from "@/server/rbac";
import { teamRows } from "@/server/team-export";
import { toCsv, toXlsx } from "@/server/export";

export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return new Response("Sessão expirada.", { status: 401 });
  if (!can(auth.perms, "usuarios", "exportar")) return new Response("Sem permissão.", { status: 403 });
  const { headers, rows } = await teamRows();
  const stamp = new Date().toISOString().slice(0, 10);
  if (new URL(req.url).searchParams.get("formato") === "xlsx") {
    return new Response(new Uint8Array(toXlsx("Equipe", headers, rows)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="equipe-${stamp}.xlsx"`,
      },
    });
  }
  return new Response(toCsv(headers, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="equipe-${stamp}.csv"` },
  });
}

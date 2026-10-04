import { notFound } from "next/navigation";
import { getAdminContext } from "@/server/admin";
import { can } from "@/server/rbac";
import { teamRows } from "@/server/team-export";
import { formatDateTime } from "@/lib/format";
import { PrintOnLoad } from "../relatorios-impressao/[slug]/print";

export const metadata = { title: "Equipe — impressão" };

export default async function TeamPrint() {
  const ctx = await getAdminContext();
  if (!can(ctx.auth.perms, "usuarios", "exportar")) notFound();
  const { headers, rows } = await teamRows();
  return (
    <main className="mx-auto max-w-[1100px] bg-white p-8 text-[11px]">
      <PrintOnLoad />
      <h1 className="text-xl font-semibold">Equipe · FINA&CLÁSSICA + BRAVUS</h1>
      <p className="mb-4 text-stone-500">Gerado em {formatDateTime(new Date())} por {ctx.auth.user.fullName}</p>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className="border-b border-stone-400 px-1.5 py-1 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border-b border-stone-200 px-1.5 py-1">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

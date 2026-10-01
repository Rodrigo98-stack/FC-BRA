import { listTeam } from "./services/users";
import { getBrands } from "./services/brands";
import { formatDate, formatDateTime } from "@/lib/format";
import { USER_STATUS_LABELS } from "@/lib/domain";

export async function teamRows() {
  const [people, brands] = await Promise.all([listTeam({}), getBrands()]);
  const bn = new Map(brands.map((b) => [b.id, b.name]));
  const headers = ["Nome", "E-mail", "Cargo", "Papéis (escopo)", "Status", "Admissão", "Último acesso"];
  const rows = people.map((u) => [
    u.fullName,
    u.email,
    u.jobTitle ?? "",
    u.isOwner ? "Administrador principal (tudo)" : u.roles.map((r) => `${r.roleName} (${r.brandId ? bn.get(r.brandId) : "ambas"})`).join("; "),
    USER_STATUS_LABELS[u.status] ?? u.status,
    u.admissionDate ? formatDate(u.admissionDate) : "",
    u.lastAccessAt ? formatDateTime(u.lastAccessAt) : "Nunca",
  ]);
  return { headers, rows };
}

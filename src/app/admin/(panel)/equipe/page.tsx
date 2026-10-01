import Link from "next/link";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { listInvitations, listRolesWithUsage, listTeam } from "@/server/services/users";
import { listResource, getResource } from "@/server/resources";
import { revokeInviteAction } from "./actions";
import { formatDateTime } from "@/lib/format";
import { initials } from "@/lib/text";
import { INVITATION_STATUS_LABELS, USER_STATUS_LABELS } from "@/lib/domain";
import {
  Badge,
  BrandTag,
  CellDate,
  cx,
  DemoBadge,
  EmptyState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Forbidden,
  LinkButton,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { UserStatusBadge } from "@/components/admin/badges";
import { ConfirmAction } from "@/components/admin/client";

export const metadata = { title: "Usuários e equipe" };

type SP = Record<string, string | undefined>;

export default async function TeamPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await guard("usuarios");
  if (!ctx.allowed) return <Forbidden module="Usuários e equipe" />;
  const sp = await searchParams;
  const tab = sp.aba === "convites" || sp.aba === "times" ? sp.aba : "pessoas";
  const { perms } = ctx.auth;
  const brands = new Map(ctx.brands.map((b) => [b.id, b]));
  const [people, invites, roles, teams] = await Promise.all([
    listTeam({
      roleId: sp.papel ?? null,
      status: sp.status ?? null,
      brandId: sp.marca ?? null,
      q: sp.q ?? null,
      admissionFrom: sp.admissao_de ?? null,
      admissionTo: sp.admissao_ate ?? null,
    }),
    listInvitations(),
    listRolesWithUsage(),
    tab === "times" ? listResource(getResource("times"), ctx.auth, { q: sp.q, perPage: 100 }) : null,
  ]);
  const pending = invites.filter((i) => i.status === "pendente").length;
  const tabs = [
    { key: "pessoas", label: `Pessoas (${people.length})` },
    { key: "convites", label: `Convites${pending ? ` (${pending} pendente${pending > 1 ? "s" : ""})` : ""}` },
    { key: "times", label: "Times" },
  ];
  const canInvite = can(perms, "usuarios", "convidar");
  const canExport = can(perms, "usuarios", "exportar");

  return (
    <div>
      <PageHeader
        title="Usuários e equipe"
        description="Administradores, sócios, funcionários e colaboradores, com papéis e escopo por marca."
        actions={
          <>
            {canExport && (
              <>
                <LinkButton href="/api/admin/export-equipe?formato=csv">CSV</LinkButton>
                <LinkButton href="/admin/equipe-impressao">PDF</LinkButton>
              </>
            )}
            {canInvite && (
              <LinkButton href="/admin/equipe/convidar" variant="primary">
                Convidar pessoa
              </LinkButton>
            )}
          </>
        }
      />
      <nav className="mb-4 flex gap-1 border-b border-stone-200" aria-label="Seções">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "pessoas" ? "/admin/equipe" : `/admin/equipe?aba=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-stone-900 font-medium text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "pessoas" && (
        <Panel bodyClassName="p-0">
          <FilterBar>
            <FilterSearch value={sp.q} placeholder="Nome, e-mail ou cargo" />
            <FilterSelect name="papel" label="Papel" value={sp.papel} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
            <FilterSelect name="status" label="Status" value={sp.status} options={USER_STATUS_LABELS} />
            <FilterSelect name="marca" label="Marca" value={sp.marca} allLabel="Todas" options={ctx.brands.map((b) => ({ value: b.id, label: b.name }))} />
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              Admissão de
              <input type="date" name="admissao_de" defaultValue={sp.admissao_de} className="admin-input py-1.5" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-500">
              até
              <input type="date" name="admissao_ate" defaultValue={sp.admissao_ate} className="admin-input py-1.5" />
            </label>
          </FilterBar>
          {people.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Pessoa</Th>
                  <Th>Papel e escopo</Th>
                  <Th>Status</Th>
                  <Th>Último acesso</Th>
                  <Th>Admissão</Th>
                  <Th align="right">
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {people.map((u) => (
                  <tr key={u.id} className="hover:bg-stone-50/60">
                    <Td>
                      <div className="flex items-center gap-3">
                        {u.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">{initials(u.fullName)}</span>
                        )}
                        <div className="min-w-0">
                          <Link href={`/admin/equipe/${u.id}`} className="flex items-center gap-2 font-medium text-stone-900 hover:underline">
                            {u.fullName} <DemoBadge show={u.isDemo} />
                          </Link>
                          <span className="block truncate text-xs text-stone-500">
                            {u.email}
                            {u.jobTitle && ` · ${u.jobTitle}`}
                          </span>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {u.isOwner ? (
                        <Badge tone="info">Administrador principal · tudo</Badge>
                      ) : u.roles.length || u.customPermissions ? (
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={`${r.roleId}-${r.brandId}`}>
                              {r.roleName} · {r.brandId ? brands.get(r.brandId)?.name : "ambas"}
                            </Badge>
                          ))}
                          {u.customPermissions > 0 && <Badge tone="warning">+{u.customPermissions} permissões</Badge>}
                        </div>
                      ) : (
                        <span className="text-stone-400">Sem papel</span>
                      )}
                    </Td>
                    <Td>
                      <UserStatusBadge status={u.status} />
                    </Td>
                    <Td className="text-xs">{u.lastAccessAt ? formatDateTime(u.lastAccessAt) : "Nunca"}</Td>
                    <Td>
                      <CellDate value={u.admissionDate} />
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <LinkButton href={`/admin/equipe/${u.id}`} variant="ghost" className="py-1">
                          Editar
                        </LinkButton>
                        {can(perms, "auditoria", "visualizar") && (
                          <LinkButton href={`/admin/auditoria?usuario=${u.id}`} variant="ghost" className="py-1">
                            Logs
                          </LinkButton>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Ninguém encontrado com esses filtros" />
          )}
        </Panel>
      )}

      {tab === "convites" && (
        <Panel bodyClassName="p-0">
          {invites.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>E-mail</Th>
                  <Th>Papel</Th>
                  <Th>Marca</Th>
                  <Th>Status</Th>
                  <Th>Expira</Th>
                  <Th>Convidado por</Th>
                  <Th align="right">
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      {i.email}
                      {i.fullName && <span className="block text-xs text-stone-500">{i.fullName}</span>}
                    </Td>
                    <Td>{i.roleName}</Td>
                    <Td>{i.brandId ? brands.get(i.brandId)?.name : "Ambas"}</Td>
                    <Td>
                      <Badge tone={i.status === "pendente" ? "warning" : i.status === "aceito" ? "success" : "neutral"}>{INVITATION_STATUS_LABELS[i.status]}</Badge>
                    </Td>
                    <Td className="text-xs">{formatDateTime(i.expiresAt)}</Td>
                    <Td className="text-xs">{i.invitedByName ?? "—"}</Td>
                    <Td align="right">
                      {i.status === "pendente" && can(perms, "usuarios", "revogar") && (
                        <ConfirmAction
                          label="Revogar"
                          variant="ghost"
                          className="py-1 text-red-700"
                          requireTyping={false}
                          title="Revogar convite?"
                          description="O link deixa de funcionar imediatamente."
                          action={revokeInviteAction.bind(null, i.id)}
                        />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Nenhum convite enviado" action={canInvite ? <LinkButton href="/admin/equipe/convidar" variant="primary">Convidar pessoa</LinkButton> : undefined} />
          )}
        </Panel>
      )}

      {tab === "times" && teams && (
        <Panel
          bodyClassName="p-0"
          actions={can(perms, "usuarios", "criar") ? <LinkButton href="/admin/equipe/times/novo" variant="primary">Novo time</LinkButton> : null}
          title="Times"
        >
          {teams.rows.length ? (
            <ul className="divide-y divide-stone-100">
              {teams.rows.map((t) => (
                <li key={String(t.id)} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span>
                    <Link href={`/admin/equipe/times/${t.id}`} className="font-medium hover:underline">
                      {String(t.name)}
                    </Link>{" "}
                    <DemoBadge show={Boolean(t.isDemo)} />
                    <span className="block text-xs text-stone-500">
                      {t.brandId ? <BrandTag name={brands.get(String(t.brandId))?.name ?? ""} slug={brands.get(String(t.brandId))?.slug} /> : "Ambas as marcas"}
                      {t.description ? ` · ${t.description}` : ""}
                    </span>
                  </span>
                  <LinkButton href={`/admin/equipe/times/${t.id}`} variant="ghost" className="py-1">
                    Gerenciar
                  </LinkButton>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum time criado" />
          )}
        </Panel>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { formOptions, getResource, getResourceRow, listResource, newLabel } from "@/server/resources";
import { deleteResourceAction, saveResourceAction } from "@/app/admin/(panel)/resource-actions";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import {
  AdminPagination,
  Badge,
  BrandTag,
  DemoBadge,
  EmptyState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Forbidden,
  hrefWith,
  LinkButton,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
} from "./ui";
import { ConfirmAction } from "./client";
import { ResourceForm } from "./resource-form";

type SP = Record<string, string | undefined>;

export async function ResourceListPage({
  resourceKey,
  basePath,
  searchParams,
  extraActions,
}: {
  resourceKey: string;
  basePath: string;
  searchParams: SP;
  extraActions?: React.ReactNode;
}) {
  const def = getResource(resourceKey);
  const ctx = await guard(def.module);
  if (!ctx.allowed) return <Forbidden module={def.title} />;
  const page = Number(searchParams.pagina ?? 1) || 1;
  const brandFilter = searchParams.marca ?? ctx.selectedBrandId ?? null;
  const list = await listResource(def, ctx.auth, {
    q: searchParams.q,
    brandId: brandFilter,
    filters: Object.fromEntries((def.filters ?? []).map((f) => [f.name, searchParams[f.name] ?? null])),
    page,
  });
  const canCreate = can(ctx.auth.perms, def.module, "criar");
  const canDelete = can(ctx.auth.perms, def.module, "excluir");
  const brandsById = new Map(ctx.brands.map((b) => [b.id, b]));

  return (
    <div>
      <PageHeader
        title={def.title}
        description={def.description}
        actions={
          <>
            {extraActions}
            {canCreate && (
              <LinkButton href={`${basePath}/novo`} variant="primary">
                {newLabel(def)}
              </LinkButton>
            )}
          </>
        }
      />
      <Panel bodyClassName="p-0">
        <FilterBar>
          <FilterSearch value={searchParams.q} />
          {def.brandMode !== "none" && ctx.visibleBrands.length > 1 && (
            <FilterSelect
              name="marca"
              label="Marca"
              value={brandFilter}
              allLabel="Todas"
              options={ctx.visibleBrands.map((b) => ({ value: b.id, label: b.name }))}
            />
          )}
          {(def.filters ?? []).map((f) => (
            <FilterSelect key={f.name} name={f.name} label={f.label} value={searchParams[f.name]} options={f.options} />
          ))}
        </FilterBar>
        {list.rows.length === 0 ? (
          <EmptyState
            title={searchParams.q ? "Nada encontrado com esses filtros" : `${def.feminine ? "Nenhuma" : "Nenhum"} ${def.singular} ${def.feminine ? "cadastrada" : "cadastrado"}`}
            text={searchParams.q ? "Ajuste a busca ou limpe os filtros." : def.description}
            action={canCreate ? <LinkButton href={`${basePath}/novo`} variant="primary">Cadastrar {def.singular}</LinkButton> : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                {def.columns.map((c) => (
                  <Th key={c.key} align={c.type === "money" || c.type === "int" ? "right" : undefined}>
                    {c.label}
                  </Th>
                ))}
                <Th align="right">
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => {
                const id = String(row.id);
                return (
                  <tr key={id} className="hover:bg-stone-50/60">
                    {def.columns.map((c, ci) => {
                      const v = row[c.key];
                      let content: React.ReactNode;
                      switch (c.type) {
                        case "money":
                          content = v === null || v === undefined ? <span className="text-stone-400">—</span> : formatBRL(v);
                          break;
                        case "int":
                          content = v === null || v === undefined ? "—" : String(v);
                          break;
                        case "date":
                          content = v ? formatDate(String(v)) : "—";
                          break;
                        case "datetime":
                          content = v ? formatDateTime(String(v)) : "—";
                          break;
                        case "badge":
                          content = v ? <Badge>{c.options?.[String(v)] ?? String(v)}</Badge> : "—";
                          break;
                        case "brand": {
                          const b = v ? brandsById.get(String(v)) : null;
                          content = b ? <BrandTag name={b.name} slug={b.slug} /> : <span className="text-stone-500">Ambas</span>;
                          break;
                        }
                        case "bool":
                          content = v ? <Badge tone="success">Sim</Badge> : <Badge>Não</Badge>;
                          break;
                        case "image":
                          content = v ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={String(v)} alt="" className="h-10 w-16 rounded object-cover" />
                          ) : (
                            <span className="text-stone-400">—</span>
                          );
                          break;
                        default:
                          content = v === null || v === undefined || v === "" ? <span className="text-stone-400">—</span> : String(v);
                      }
                      return (
                        <Td key={c.key} align={c.type === "money" || c.type === "int" ? "right" : undefined}>
                          {ci === 0 || (ci === 1 && def.columns[0].type === "image") ? (
                            <span className="flex items-center gap-2">
                              <Link href={`${basePath}/${id}`} className="font-medium text-stone-900 hover:underline">
                                {content}
                              </Link>
                              <DemoBadge show={Boolean(row.isDemo)} />
                            </span>
                          ) : (
                            content
                          )}
                        </Td>
                      );
                    })}
                    <Td align="right">
                      <div className="flex justify-end gap-1.5">
                        <LinkButton href={`${basePath}/${id}`} variant="ghost" className="py-1">
                          Editar
                        </LinkButton>
                        {canDelete && (
                          <ConfirmAction
                            label="Excluir"
                            variant="ghost"
                            className="py-1 text-red-700"
                            title={`Excluir ${def.singular}?`}
                            description="O registro sai das listagens, mas o histórico é preservado (exclusão lógica)."
                            action={deleteResourceAction.bind(null, def.key, id)}
                          />
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <AdminPagination page={list.page} pages={list.pages} total={list.total} makeHref={(p) => hrefWith(basePath, searchParams, { pagina: p })} />
      </Panel>
    </div>
  );
}

export async function ResourceEditPage({ resourceKey, basePath, id }: { resourceKey: string; basePath: string; id: string | null }) {
  const def = getResource(resourceKey);
  const ctx = await guard(def.module, id ? "visualizar" : "criar");
  if (!ctx.allowed) return <Forbidden module={def.title} />;
  const row = id ? await getResourceRow(def, id) : null;
  if (id && !row) notFound();
  const canEdit = can(ctx.auth.perms, def.module, id ? "editar" : "criar");
  const options = await formOptions(ctx.auth, def.module);
  const locked = row ? def.locked?.(row) : null;
  const title = id ? `Editar ${def.singular}` : newLabel(def);
  const defaults = row ?? (ctx.selectedBrandId ? { brandId: ctx.selectedBrandId } : null);

  return (
    <div className="max-w-3xl">
      <PageHeader title={title} crumbs={[{ href: basePath, label: def.title }, { label: id ? String(row?.name ?? row?.title ?? row?.description ?? "Editar") : def.feminine ? "Nova" : "Novo" }]} />
      <Panel>
        {locked ? (
          <p className="text-sm text-stone-600">{locked}</p>
        ) : canEdit ? (
          <ResourceForm
            fields={def.fields}
            values={defaults}
            options={options}
            action={saveResourceAction.bind(null, def.key, id)}
            cancelHref={basePath}
            submitLabel={id ? "Salvar alterações" : `Cadastrar ${def.singular}`}
          />
        ) : (
          <p className="text-sm text-stone-600">Você pode visualizar, mas não editar este registro.</p>
        )}
      </Panel>
    </div>
  );
}

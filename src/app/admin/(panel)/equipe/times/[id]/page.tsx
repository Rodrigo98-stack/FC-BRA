import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { guard } from "@/server/admin";
import { can } from "@/server/rbac";
import { getDb, schema } from "@/server/db";
import { ResourceEditPage } from "@/components/admin/resource-pages";
import { Panel } from "@/components/admin/ui";
import { TeamMembersEditor } from "../../team-client";

export const metadata = { title: "Time" };

export default async function TeamDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await guard("usuarios");
  const db = await getDb();
  const [members, users] = await Promise.all([
    db.select().from(schema.teamMembers).where(eq(schema.teamMembers.teamId, id)),
    db
      .select({ id: schema.users.id, name: schema.users.fullName })
      .from(schema.users)
      .where(and(isNull(schema.users.deletedAt)))
      .orderBy(schema.users.fullName),
  ]);
  return (
    <div className="space-y-6">
      <ResourceEditPage resourceKey="times" basePath="/admin/equipe?aba=times" id={id} />
      {ctx.allowed && (
        <div className="max-w-3xl">
          <Panel title="Membros">
            {can(ctx.auth.perms, "usuarios", "editar") ? (
              <TeamMembersEditor teamId={id} users={users} initial={members.map((m) => m.userId)} />
            ) : (
              <p className="text-sm text-stone-600">{members.length} membro(s).</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

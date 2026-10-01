import { notFound } from "next/navigation";
import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Produtos planejados · editar" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <ResourceEditPage resourceKey="planejados" basePath="/admin/planejados" id={id} />;
}

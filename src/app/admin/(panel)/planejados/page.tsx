import { ResourceListPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Produtos planejados" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ResourceListPage resourceKey="planejados" basePath="/admin/planejados" searchParams={await searchParams} />;
}

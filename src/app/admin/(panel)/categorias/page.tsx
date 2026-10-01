import { ResourceListPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Categorias" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ResourceListPage resourceKey="categorias" basePath="/admin/categorias" searchParams={await searchParams} />;
}

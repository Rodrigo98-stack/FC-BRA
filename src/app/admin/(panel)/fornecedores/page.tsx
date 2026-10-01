import { ResourceListPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Fornecedores" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ResourceListPage resourceKey="fornecedores" basePath="/admin/fornecedores" searchParams={await searchParams} />;
}

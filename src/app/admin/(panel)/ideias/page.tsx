import { ResourceListPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Ideias e melhorias" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ResourceListPage resourceKey="ideias" basePath="/admin/ideias" searchParams={await searchParams} />;
}

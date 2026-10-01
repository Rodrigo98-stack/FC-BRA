import { ResourceListPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Banners" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ResourceListPage resourceKey="banners" basePath="/admin/banners" searchParams={await searchParams} />;
}

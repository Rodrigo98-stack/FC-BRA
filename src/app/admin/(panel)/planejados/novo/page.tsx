import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Produtos planejados · novo" };

export default function Page() {
  return <ResourceEditPage resourceKey="planejados" basePath="/admin/planejados" id={null} />;
}

import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Categorias · novo" };

export default function Page() {
  return <ResourceEditPage resourceKey="categorias" basePath="/admin/categorias" id={null} />;
}

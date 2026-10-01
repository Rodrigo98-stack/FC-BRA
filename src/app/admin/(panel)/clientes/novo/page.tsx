import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Novo cliente" };

export default function Page() {
  return <ResourceEditPage resourceKey="clientes" basePath="/admin/clientes" id={null} />;
}

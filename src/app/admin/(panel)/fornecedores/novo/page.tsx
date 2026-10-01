import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Fornecedores · novo" };

export default function Page() {
  return <ResourceEditPage resourceKey="fornecedores" basePath="/admin/fornecedores" id={null} />;
}

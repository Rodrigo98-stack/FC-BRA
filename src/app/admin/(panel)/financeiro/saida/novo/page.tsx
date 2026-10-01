import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Nova saída" };

export default function Page() {
  return <ResourceEditPage resourceKey="despesas" basePath="/admin/financeiro" id={null} />;
}

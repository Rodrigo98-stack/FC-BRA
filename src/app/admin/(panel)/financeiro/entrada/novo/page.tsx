import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Nova entrada" };

export default function Page() {
  return <ResourceEditPage resourceKey="receitas" basePath="/admin/financeiro" id={null} />;
}

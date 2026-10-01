import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Ideias e melhorias · novo" };

export default function Page() {
  return <ResourceEditPage resourceKey="ideias" basePath="/admin/ideias" id={null} />;
}

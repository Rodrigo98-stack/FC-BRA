import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Novo time" };

export default function Page() {
  return <ResourceEditPage resourceKey="times" basePath="/admin/equipe?aba=times" id={null} />;
}

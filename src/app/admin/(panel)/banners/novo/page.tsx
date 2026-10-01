import { ResourceEditPage } from "@/components/admin/resource-pages";

export const metadata = { title: "Banners · novo" };

export default function Page() {
  return <ResourceEditPage resourceKey="banners" basePath="/admin/banners" id={null} />;
}

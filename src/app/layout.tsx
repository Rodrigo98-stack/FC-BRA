import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getAllCms } from "@/server/services/cms";
import { getOrigin } from "@/server/request";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const base = process.env.SITE_URL ?? (await getOrigin());
  let name = "FINA&CLÁSSICA + BRAVUS";
  let favicon: string | null = null;
  try {
    const cms = await getAllCms();
    name = cms.site.name || name;
    favicon = cms.site.favicon_url;
  } catch {
    /* banco indisponível: usa padrões */
  }
  return {
    metadataBase: new URL(base),
    title: { default: name, template: `%s · ${name}` },
    description: "FINA&CLÁSSICA (moda feminina) e BRAVUS (moda masculina).",
    icons: favicon ? { icon: favicon } : undefined,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1c1917",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

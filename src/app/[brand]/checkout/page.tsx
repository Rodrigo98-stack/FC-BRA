import type { Metadata } from "next";
import Link from "next/link";
import { loadStore } from "@/server/store-context";
import { CheckoutView } from "@/components/store/cart-client";
import { BR_STATES } from "@/lib/domain";

export const metadata: Metadata = { title: "Finalizar pedido", robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const { brand, cms } = await loadStore(slug);
  const pickup =
    cms.pickup.enabled && cms.pickup.address
      ? { address: cms.pickup.address, mapsUrl: cms.pickup.maps_url, notes: cms.pickup.notes }
      : null;
  return (
    <div className="mx-auto max-w-[1400px] px-5 pt-10 lg:px-10 lg:pt-14">
      <nav aria-label="Trilha" className="muted mb-6 text-xs">
        <Link href={`/${brand.slug}/carrinho`} className="hover:underline">Carrinho</Link>
        <span className="mx-2">/</span>
        <span aria-current="page">Finalizar pedido</span>
      </nav>
      <h1 className="font-display mb-10 text-5xl leading-none lg:text-6xl">Finalizar pedido</h1>
      <CheckoutView brand={brand.slug} brandName={brand.name} states={BR_STATES} pickup={pickup} />
    </div>
  );
}

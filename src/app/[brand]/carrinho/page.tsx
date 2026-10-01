import type { Metadata } from "next";
import { loadStore } from "@/server/store-context";
import { CartView } from "@/components/store/cart-client";

export const metadata: Metadata = { title: "Carrinho", robots: { index: false } };

export default async function CartPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const { brand } = await loadStore(slug);
  return (
    <div className="mx-auto max-w-[1400px] px-5 pt-10 lg:px-10 lg:pt-14">
      <h1 className="font-display mb-10 text-5xl leading-none lg:text-6xl">Carrinho</h1>
      <CartView brand={brand.slug} />
    </div>
  );
}

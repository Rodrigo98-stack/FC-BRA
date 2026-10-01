"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/visitor";

/** Registra visualização de página/produto/checkout (analytics próprio). */
export function Track({ brand, type, productId }: { brand: string; type: "page_view" | "product_view" | "begin_checkout"; productId?: string }) {
  const pathname = usePathname();
  useEffect(() => {
    track({ brand, type, productId, path: pathname });
  }, [brand, type, productId, pathname]);
  return null;
}

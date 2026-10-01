"use client";
/**
 * Carrinho (§8.1): um carrinho POR MARCA (nunca mistura lojas), persistido
 * em localStorage para visitantes. Preços aqui são só para exibição — o
 * servidor recalcula tudo ao finalizar.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type CartItem = {
  variantId: string;
  productId: string;
  slug: string;
  categorySlug: string;
  name: string;
  size: string | null;
  color: string | null;
  image: string | null;
  price: number;
  quantity: number;
  maxStock: number;
};

type CartState = {
  carts: Record<string, CartItem[]>;
  add: (brand: string, item: CartItem) => void;
  setQuantity: (brand: string, variantId: string, quantity: number) => void;
  remove: (brand: string, variantId: string) => void;
  clear: (brand: string) => void;
  sync: (brand: string, items: CartItem[]) => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      carts: {},
      add: (brand, item) =>
        set((s) => {
          const list = [...(s.carts[brand] ?? [])];
          const idx = list.findIndex((i) => i.variantId === item.variantId);
          if (idx >= 0) {
            const merged = Math.min(list[idx].quantity + item.quantity, item.maxStock || 99);
            list[idx] = { ...list[idx], ...item, quantity: merged };
          } else {
            list.push({ ...item, quantity: Math.min(item.quantity, item.maxStock || 99) });
          }
          return { carts: { ...s.carts, [brand]: list } };
        }),
      setQuantity: (brand, variantId, quantity) =>
        set((s) => ({
          carts: {
            ...s.carts,
            [brand]: (s.carts[brand] ?? []).map((i) =>
              i.variantId === variantId ? { ...i, quantity: Math.max(1, Math.min(quantity, i.maxStock || 99)) } : i,
            ),
          },
        })),
      remove: (brand, variantId) =>
        set((s) => ({ carts: { ...s.carts, [brand]: (s.carts[brand] ?? []).filter((i) => i.variantId !== variantId) } })),
      clear: (brand) => set((s) => ({ carts: { ...s.carts, [brand]: [] } })),
      sync: (brand, items) => set((s) => ({ carts: { ...s.carts, [brand]: items } })),
    }),
    {
      name: "fcbra-cart-v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

export function cartCount(items: CartItem[] | undefined) {
  return (items ?? []).reduce((a, i) => a + i.quantity, 0);
}

"use client";
import { useState, useCallback, useMemo } from "react";
import type { Product } from "@/types/product";

export interface CartLine {
  productId: string;
  productName: string;
  barcode: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
}

export function usePosCart() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountPct, setDiscountPct] = useState<number>(0);

  const addProduct = useCallback((p: Product) => {
    if (p.stock === 0) return;
    setLines(prev => {
      const idx = prev.findIndex(l => l.productId === p.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
        return updated;
      }
      return [...prev, {
        productId: p.id,
        productName: p.nameAr || p.name,
        barcode: p.barcode || "",
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        quantity: 1,
      }];
    });
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    const safeQty = Math.max(0, qty);
    setLines(prev =>
      prev.map(l => l.productId === productId ? { ...l, quantity: safeQty } : l)
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines(prev => prev.filter(l => l.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
    setDiscountValue(0);
    setDiscountPct(0);
  }, []);

  // Totals for selling price (credit mode)
  const sellSubtotal = useMemo(
    () => lines.reduce((s, l) => s + l.sellingPrice * l.quantity, 0),
    [lines]
  );

  // Totals for purchase price (cash mode)
  const buySubtotal = useMemo(
    () => lines.reduce((s, l) => s + l.purchasePrice * l.quantity, 0),
    [lines]
  );

  const effectiveDiscount = useMemo(() => {
    if (discountValue > 0) return discountValue;
    if (discountPct > 0) return Math.round(sellSubtotal * discountPct / 100);
    return 0;
  }, [discountValue, discountPct, sellSubtotal]);

  const sellTotal = Math.max(0, sellSubtotal - effectiveDiscount);
  const buyTotal  = Math.max(0, buySubtotal  - effectiveDiscount);

  return {
    lines,
    discountValue, setDiscountValue,
    discountPct, setDiscountPct,
    addProduct,
    updateQty,
    removeLine,
    clearCart,
    sellSubtotal, sellTotal,
    buySubtotal, buyTotal,
    effectiveDiscount,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
  };
}

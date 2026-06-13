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
  // عند البيع بالمبلغ: هذا هو إجمالي السطر بالضبط (لا يُعاد حسابه من السعر×الكمية
  // حتى لا يتغيّر المبلغ الذي كتبه المستخدم بسبب التقريب).
  amount?: number;
}

// إجمالي السطر: المبلغ المكتوب إن وُجد، وإلا السعر × الكمية.
export const lineTotal = (l: CartLine) =>
  l.amount != null ? l.amount : l.sellingPrice * l.quantity;

export function usePosCart() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountPct, setDiscountPct] = useState<number>(0);

  const addProduct = useCallback((p: Product): boolean => {
    if (p.stock <= 0) return false;
    setLines(prev => {
      const idx = prev.findIndex(l => l.productId === p.id);
      if (idx >= 0) {
        const updated = [...prev];
        // مسح وضع "البيع بالمبلغ" عند إعادة المسح والعودة للكمية
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1, amount: undefined };
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
    return true;
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    const safeQty = Math.max(0, qty);
    setLines(prev =>
      // تعديل الكمية يدوياً يلغي وضع "البيع بالمبلغ"
      prev.map(l => l.productId === productId ? { ...l, quantity: safeQty, amount: undefined } : l)
    );
  }, []);

  // البيع بالمبلغ: المبلغ المكتوب هو إجمالي السطر بالضبط، والكمية تُشتقّ منه (للمخزون).
  const setLineAmount = useCallback((productId: string, amount: number) => {
    const safeAmount = Math.max(0, amount);
    setLines(prev =>
      prev.map(l => {
        if (l.productId !== productId) return l;
        const qty = l.sellingPrice > 0 ? safeAmount / l.sellingPrice : 0;
        return { ...l, amount: safeAmount, quantity: qty };
      })
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

  // Totals for selling price (used for both cash and credit)
  const sellSubtotal = useMemo(
    () => lines.reduce((s, l) => s + lineTotal(l), 0),
    [lines]
  );

  // Cash mode also uses selling price
  const buySubtotal = useMemo(
    () => lines.reduce((s, l) => s + lineTotal(l), 0),
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
    setLineAmount,
    removeLine,
    clearCart,
    sellSubtotal, sellTotal,
    buySubtotal, buyTotal,
    effectiveDiscount,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
  };
}

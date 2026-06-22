"use client";
import { useState, useEffect, useMemo } from "react";
import { subscribeProducts } from "@/lib/firestore/products";
import type { Product } from "@/types/product";

export function useProducts(storeId: string | undefined) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // Timeout: if no data after 4s (offline), stop loading to unblock the UI
    const timer = setTimeout(() => setLoading(false), 4000);
    const unsub = subscribeProducts(storeId, (prods) => {
      clearTimeout(timer);
      setProducts(prods);
      setLoading(false);
    });
    return () => { clearTimeout(timer); unsub(); };
  }, [storeId]);

  // مذكّرة: تُحسب مرة واحدة عند تغيّر المنتجات فقط. بدونها كانت تُنشأ مصفوفتان
  // جديدتان في كل تصيير، فتُعيد المكوّنات المستهلِكة (نقطة البيع، الشريط الجانبي) حساباتها بلا داعٍ.
  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products]
  );
  const lowStock = useMemo(
    () => activeProducts.filter((p) => p.stock <= p.minStock),
    [activeProducts]
  );

  return { products, activeProducts, lowStock, loading, error };
}

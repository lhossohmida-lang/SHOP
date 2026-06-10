"use client";
import { useState, useEffect } from "react";
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

  const lowStock = products.filter((p) => p.stock <= p.minStock && p.isActive);
  const activeProducts = products.filter((p) => p.isActive);

  return { products, activeProducts, lowStock, loading, error };
}

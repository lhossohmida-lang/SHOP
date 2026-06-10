"use client";
import { useState, useEffect } from "react";
import { subscribePurchases } from "@/lib/firestore/purchases";
import type { Purchase } from "@/types/purchase";

export function usePurchases(storeId: string | undefined) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 4000);
    const unsub = subscribePurchases(storeId, (p) => {
      clearTimeout(timer);
      setPurchases(p);
      setLoading(false);
    });
    return () => { clearTimeout(timer); unsub(); };
  }, [storeId]);

  return { purchases, loading };
}

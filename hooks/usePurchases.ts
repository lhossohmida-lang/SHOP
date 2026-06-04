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
    const unsub = subscribePurchases(storeId, (p) => {
      setPurchases(p);
      setLoading(false);
    });
    return unsub;
  }, [storeId]);

  return { purchases, loading };
}

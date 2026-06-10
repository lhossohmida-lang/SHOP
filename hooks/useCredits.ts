"use client";
import { useState, useEffect } from "react";
import { subscribeCreditCustomers } from "@/lib/firestore/credits";
import type { CreditCustomer } from "@/types/credit";

export function useCredits(storeId: string | undefined) {
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 4000);
    const unsub = subscribeCreditCustomers(storeId, (c) => {
      clearTimeout(timer);
      setCustomers(c);
      setLoading(false);
    });
    return () => { clearTimeout(timer); unsub(); };
  }, [storeId]);

  const totalDebt = customers.reduce((sum, c) => sum + c.totalDebt, 0);
  const activeCustomers = customers.filter((c) => c.isActive);

  return { customers, activeCustomers, totalDebt, loading };
}

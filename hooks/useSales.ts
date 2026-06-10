"use client";
import { useState, useEffect } from "react";
import { subscribeSales, getSalesToday } from "@/lib/firestore/sales";
import type { Sale } from "@/types/sale";

export function useSales(storeId: string | undefined, limitCount = 50) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    // Load today's sales separately
    getSalesToday(storeId).then(setTodaySales).catch(console.error);
    const timer = setTimeout(() => setLoading(false), 4000);
    const unsub = subscribeSales(storeId, (s) => {
      clearTimeout(timer);
      setSales(s);
      setLoading(false);
    }, limitCount);
    return () => { clearTimeout(timer); unsub(); };
  }, [storeId, limitCount]);

  const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0);
  const todayCount = todaySales.length;
  const todayAvg = todayCount > 0 ? todayTotal / todayCount : 0;

  return { sales, todaySales, todayTotal, todayCount, todayAvg, loading };
}

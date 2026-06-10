"use client";
import { useState, useEffect } from "react";
import { subscribeExpenses } from "@/lib/firestore/expenses";
import type { Expense } from "@/types/expense";

export function useExpenses(storeId: string | undefined) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 4000);
    const unsub = subscribeExpenses(storeId, (data) => {
      clearTimeout(timer);
      setExpenses(data);
      setLoading(false);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [storeId]);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return { expenses, totalExpenses, loading };
}

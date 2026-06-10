import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  getDocs,
  getDocsFromCache,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeFirestoreData } from "@/lib/firestore/helpers";
import type { Expense } from "@/types/expense";

function toExpense(id: string, data: Record<string, unknown>): Expense {
  return {
    id,
    title: (data.title as string) || "",
    amount: (data.amount as number) || 0,
    note: data.note as string | undefined,
    storeId: (data.storeId as string) || "",
    createdBy: (data.createdBy as string) || "",
    createdByName: data.createdByName as string | undefined,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(),
  };
}

export function expensesCol(storeId: string) {
  return collection(db, "stores", storeId, "expenses");
}

export async function addExpense(
  storeId: string,
  data: {
    title: string;
    amount: number;
    note?: string;
    createdBy: string;
    createdByName?: string;
    createdAt?: Date;
  }
): Promise<string> {
  const ref = await addDoc(expensesCol(storeId), sanitizeFirestoreData({
    title: data.title.trim(),
    amount: data.amount,
    note: data.note?.trim() || "",
    storeId,
    createdBy: data.createdBy,
    createdByName: data.createdByName || "",
    createdAt: data.createdAt || serverTimestamp(),
  }));
  return ref.id;
}

export async function deleteExpense(storeId: string, expenseId: string): Promise<void> {
  await deleteDoc(doc(expensesCol(storeId), expenseId));
}

export function subscribeExpenses(
  storeId: string,
  callback: (expenses: Expense[]) => void
): () => void {
  const q = query(expensesCol(storeId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => toExpense(d.id, d.data())));
  });
}

function filterExpensesByDate(expenses: Expense[], start: Date, end: Date): Expense[] {
  return expenses.filter((e) => e.createdAt >= start && e.createdAt <= end);
}

export async function getExpensesByDateRange(
  storeId: string,
  start: Date,
  end: Date
): Promise<Expense[]> {
  const rangeQuery = query(
    expensesCol(storeId),
    where("createdAt", ">=", Timestamp.fromDate(start)),
    where("createdAt", "<=", Timestamp.fromDate(end)),
    orderBy("createdAt", "desc")
  );

  try {
    const snap = typeof navigator !== "undefined" && !navigator.onLine
      ? await getDocsFromCache(rangeQuery)
      : await getDocs(rangeQuery);
    return snap.docs.map((d) => toExpense(d.id, d.data()));
  } catch (error) {
    try {
      const allQuery = query(expensesCol(storeId), orderBy("createdAt", "desc"));
      const snap = await getDocsFromCache(allQuery);
      return filterExpensesByDate(
        snap.docs.map((d) => toExpense(d.id, d.data())),
        start,
        end
      );
    } catch {
      return [];
    }
  }
}

// كريديات آجلة — نفس منطق الكريديات تماماً لكن في مجموعات Firestore منفصلة
import {
  collection,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  where,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeFirestoreData, getDocsOfflineFirst } from "@/lib/firestore/helpers";
import type { CreditCustomer, CreditTransaction } from "@/types/credit";

function toCustomer(id: string, data: Record<string, unknown>): CreditCustomer {
  return {
    id,
    name: (data.name as string) || "",
    phone: (data.phone as string) || "",
    address: data.address as string | undefined,
    totalDebt: (data.totalDebt as number) || 0,
    creditLimit: (data.creditLimit as number) || 50000,
    isActive: data.isActive !== false,
    storeId: (data.storeId as string) || "",
    dueDate: data.dueDate as string | undefined,
    lastTransactionAt:
      data.lastTransactionAt instanceof Timestamp
        ? data.lastTransactionAt.toDate()
        : new Date(),
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(),
  };
}

function toTransaction(id: string, data: Record<string, unknown>): CreditTransaction {
  return {
    id,
    customerId: (data.customerId as string) || "",
    customerName: (data.customerName as string) || "",
    type: (data.type as CreditTransaction["type"]) || "purchase",
    amount: (data.amount as number) || 0,
    balanceBefore: (data.balanceBefore as number) || 0,
    balanceAfter: (data.balanceAfter as number) || 0,
    saleId: data.saleId as string | undefined,
    note: data.note as string | undefined,
    createdBy: (data.createdBy as string) || "",
    storeId: (data.storeId as string) || "",
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(),
  };
}

function sortNewest(txs: CreditTransaction[]): CreditTransaction[] {
  return [...txs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function ajalCustomersCol(storeId: string) {
  return collection(db, "stores", storeId, "ajalCustomers");
}

export function ajalTransactionsCol(storeId: string) {
  return collection(db, "stores", storeId, "ajalTransactions");
}

export async function addAjalCustomer(
  storeId: string,
  data: Omit<CreditCustomer, "id" | "createdAt" | "lastTransactionAt" | "storeId">,
  options?: { initialDebtNote?: string; createdBy?: string }
): Promise<string> {
  const initialDebt = Math.max(0, data.totalDebt || 0);
  const ref = await addDoc(ajalCustomersCol(storeId), sanitizeFirestoreData({
    ...data,
    address: data.address || "",
    dueDate: data.dueDate || "",
    storeId,
    totalDebt: initialDebt,
    createdAt: serverTimestamp(),
    lastTransactionAt: serverTimestamp(),
  }));

  if (initialDebt > 0 && options?.createdBy) {
    addAjalTransaction(storeId, {
      customerId: ref.id,
      customerName: data.name,
      type: "adjustment",
      amount: initialDebt,
      balanceBefore: 0,
      balanceAfter: initialDebt,
      note: options.initialDebtNote?.trim() || "دين افتتاحي",
      createdBy: options.createdBy,
    });
  }

  return ref.id;
}

export function addAjalDebt(
  storeId: string,
  customer: CreditCustomer,
  amount: number,
  createdBy: string,
  note = "",
  createdAt?: Date
): void {
  const debtAmount = Math.max(0, amount);
  if (debtAmount <= 0) return;

  const balanceBefore = customer.totalDebt;
  const balanceAfter = balanceBefore + debtAmount;

  addAjalTransaction(storeId, {
    customerId: customer.id,
    customerName: customer.name,
    type: "adjustment",
    amount: debtAmount,
    balanceBefore,
    balanceAfter,
    note: note.trim() || "إضافة دين",
    createdBy,
    createdAt,
  });

  updateAjalCustomer(storeId, customer.id, {
    totalDebt: balanceAfter,
    lastTransactionAt: createdAt || new Date(),
  });
}

export function updateAjalCustomer(
  storeId: string,
  customerId: string,
  data: Partial<CreditCustomer>
): void {
  updateDoc(doc(ajalCustomersCol(storeId), customerId), sanitizeFirestoreData({ ...data }))
    .catch((e) => console.warn("[updateAjalCustomer] sync pending:", e));
}

export async function deleteAjalCustomer(
  storeId: string,
  customerId: string
): Promise<void> {
  await deleteDoc(doc(ajalCustomersCol(storeId), customerId));
}

export function subscribeAjalCustomers(
  storeId: string,
  callback: (customers: CreditCustomer[]) => void
): () => void {
  const q = query(ajalCustomersCol(storeId), orderBy("totalDebt", "desc"));
  return onSnapshot(
    q,
    { includeMetadataChanges: false },
    (snap) => { callback(snap.docs.map((d) => toCustomer(d.id, d.data()))); },
    (err) => { console.warn("[Ajal] onSnapshot error:", err.code); }
  );
}

export function addAjalTransaction(
  storeId: string,
  data: Omit<CreditTransaction, "id" | "createdAt" | "storeId"> & { createdAt?: Date }
): string {
  const ref = doc(ajalTransactionsCol(storeId));
  setDoc(ref, sanitizeFirestoreData({
    ...data,
    saleId: data.saleId || "",
    note: data.note || "",
    storeId,
    createdAt: data.createdAt || new Date(),
  })).catch((e) => console.warn("[addAjalTransaction] sync pending:", e));
  return ref.id;
}

export async function getAjalTransactions(
  storeId: string,
  customerId: string
): Promise<CreditTransaction[]> {
  const q = query(ajalTransactionsCol(storeId), where("customerId", "==", customerId));
  const snap = await getDocsOfflineFirst(q);
  return sortNewest(snap.docs.map((d) => toTransaction(d.id, d.data())));
}

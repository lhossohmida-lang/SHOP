import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  where,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
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

function sortTransactionsNewestFirst(txs: CreditTransaction[]): CreditTransaction[] {
  return [...txs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function creditCustomersCol(storeId: string) {
  return collection(db, "stores", storeId, "creditCustomers");
}

export function creditTransactionsCol(storeId: string) {
  return collection(db, "stores", storeId, "creditTransactions");
}

export async function addCreditCustomer(
  storeId: string,
  data: Omit<CreditCustomer, "id" | "createdAt" | "lastTransactionAt" | "storeId">
): Promise<string> {
  const ref = await addDoc(creditCustomersCol(storeId), {
    ...data,
    storeId,
    totalDebt: 0,
    createdAt: serverTimestamp(),
    lastTransactionAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCreditCustomer(
  storeId: string,
  customerId: string,
  data: Partial<CreditCustomer>
): Promise<void> {
  await updateDoc(doc(creditCustomersCol(storeId), customerId), data);
}

export async function deleteCreditCustomer(
  storeId: string,
  customerId: string
): Promise<void> {
  await deleteDoc(doc(creditCustomersCol(storeId), customerId));
}

export function subscribeCreditCustomers(
  storeId: string,
  callback: (customers: CreditCustomer[]) => void
): () => void {
  const q = query(creditCustomersCol(storeId), orderBy("totalDebt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => toCustomer(d.id, d.data())));
  });
}

export async function addCreditTransaction(
  storeId: string,
  data: Omit<CreditTransaction, "id" | "createdAt" | "storeId"> & { createdAt?: Date }
): Promise<string> {
  const ref = await addDoc(creditTransactionsCol(storeId), {
    ...data,
    storeId,
    createdAt: data.createdAt || serverTimestamp(),
  });
  return ref.id;
}

export async function getCreditTransactions(
  storeId: string,
  customerId: string
): Promise<CreditTransaction[]> {
  const q = query(
    creditTransactionsCol(storeId),
    where("customerId", "==", customerId)
  );
  const snap = await getDocs(q);
  return sortTransactionsNewestFirst(snap.docs.map((d) => toTransaction(d.id, d.data())));
}

export function subscribeCreditTransactions(
  storeId: string,
  customerId: string,
  callback: (txs: CreditTransaction[]) => void
): () => void {
  const q = query(
    creditTransactionsCol(storeId),
    where("customerId", "==", customerId)
  );
  return onSnapshot(q, (snap) => {
    callback(sortTransactionsNewestFirst(snap.docs.map((d) => toTransaction(d.id, d.data()))));
  });
}

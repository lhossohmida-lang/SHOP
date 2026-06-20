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
  getDocs,
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
  data: Omit<CreditCustomer, "id" | "createdAt" | "lastTransactionAt" | "storeId">,
  options?: { initialDebtNote?: string; createdBy?: string }
): Promise<string> {
  const initialDebt = Math.max(0, data.totalDebt || 0);
  const ref = await addDoc(creditCustomersCol(storeId), sanitizeFirestoreData({
    ...data,
    address: data.address || "",
    dueDate: data.dueDate || "",
    storeId,
    totalDebt: initialDebt,
    createdAt: serverTimestamp(),
    lastTransactionAt: serverTimestamp(),
  }));

  if (initialDebt > 0 && options?.createdBy) {
    addCreditTransaction(storeId, {
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

export function addCustomerDebt(
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

  // كلتا العمليتان fire-and-forget — تُطبَّقان على الكاش المحلي فوراً
  addCreditTransaction(storeId, {
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

  updateCreditCustomer(storeId, customer.id, {
    totalDebt: balanceAfter,
    lastTransactionAt: createdAt || new Date(),
  });
}

export function updateCreditCustomer(
  storeId: string,
  customerId: string,
  data: Partial<CreditCustomer>
): void {
  // تُطبَّق محلياً فوراً وتتزامن لاحقاً — لا يُوقف التنفيذ أوفلاين
  updateDoc(doc(creditCustomersCol(storeId), customerId), sanitizeFirestoreData({ ...data }))
    .catch((e) => console.warn("[updateCreditCustomer] sync pending:", e));
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
  return onSnapshot(
    q,
    { includeMetadataChanges: false },
    (snap) => {
      callback(snap.docs.map((d) => toCustomer(d.id, d.data())));
    },
    (err) => {
      console.warn("[Credits] onSnapshot error (offline or permission):", err.code);
    }
  );
}

export function addCreditTransaction(
  storeId: string,
  data: Omit<CreditTransaction, "id" | "createdAt" | "storeId"> & { createdAt?: Date }
): string {
  // نُولّد ID محلياً ونكتب بـ setDoc (fire-and-forget) — يُطبَّق على الكاش فوراً دون انتظار الخادم
  const ref = doc(creditTransactionsCol(storeId));
  setDoc(ref, sanitizeFirestoreData({
    ...data,
    saleId: data.saleId || "",
    note: data.note || "",
    storeId,
    createdAt: data.createdAt || new Date(),
  })).catch((e) => console.warn("[addCreditTransaction] sync pending:", e));
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
  const snap = await getDocsOfflineFirst(q);
  return sortTransactionsNewestFirst(snap.docs.map((d) => toTransaction(d.id, d.data())));
}

/**
 * جلب جميع دفعات الكريدي (type === "payment") في فترة زمنية.
 * نجلب معاملات الفترة ثم نُرشّح الدفعات محلياً (متوافق مع وضع عدم الاتصال، بلا فهرس مركّب).
 */
export async function getCreditPaymentsByDateRange(
  storeId: string,
  start: Date,
  end: Date
): Promise<CreditTransaction[]> {
  try {
    const q = query(
      creditTransactionsCol(storeId),
      where("createdAt", ">=", start),
      where("createdAt", "<=", end),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocsOfflineFirst(q);
    return snap.docs
      .map((d) => toTransaction(d.id, d.data()))
      .filter((t) => t.type === "payment");
  } catch {
    // fallback: اجلب الكل من الكاش ورشّح بالتاريخ والنوع محلياً
    try {
      const snap = await getDocsOfflineFirst(query(creditTransactionsCol(storeId)));
      return sortTransactionsNewestFirst(
        snap.docs
          .map((d) => toTransaction(d.id, d.data()))
          .filter((t) => t.type === "payment" && t.createdAt >= start && t.createdAt <= end)
      );
    } catch {
      return [];
    }
  }
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

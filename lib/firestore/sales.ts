import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Sale } from "@/types/sale";

function toSale(id: string, data: Record<string, unknown>): Sale {
  return {
    id,
    type: (data.type as Sale["type"]) || "sale",
    items: (data.items as Sale["items"]) || [],
    subtotal: (data.subtotal as number) || 0,
    discount: (data.discount as number) || 0,
    tax: (data.tax as number) || 0,
    total: (data.total as number) || 0,
    paymentMethod: (data.paymentMethod as Sale["paymentMethod"]) || "cash",
    customerId: data.customerId as string | undefined,
    customerName: data.customerName as string | undefined,
    cashierId: (data.cashierId as string) || "",
    cashierName: (data.cashierName as string) || "",
    note: data.note as string | undefined,
    receiptNumber: (data.receiptNumber as string) || "",
    storeId: (data.storeId as string) || "",
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(),
  };
}

export function salesCol(storeId: string) {
  return collection(db, "stores", storeId, "sales");
}

export async function addSale(storeId: string, data: Omit<Sale, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(salesCol(storeId), {
    ...data,
    storeId,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeSales(
  storeId: string,
  callback: (sales: Sale[]) => void,
  limitCount = 50
): () => void {
  const q = query(salesCol(storeId), orderBy("createdAt", "desc"), limit(limitCount));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => toSale(d.id, d.data())));
  });
}

export async function getSalesToday(storeId: string): Promise<Sale[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const q = query(
    salesCol(storeId),
    where("createdAt", ">=", start),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toSale(d.id, d.data()));
}

export async function getSalesByDateRange(
  storeId: string,
  start: Date,
  end: Date
): Promise<Sale[]> {
  const q = query(
    salesCol(storeId),
    where("createdAt", ">=", start),
    where("createdAt", "<=", end),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toSale(d.id, d.data()));
}

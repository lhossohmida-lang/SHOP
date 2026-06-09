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
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeFirestoreData } from "@/lib/firestore/helpers";
import type { Purchase } from "@/types/purchase";

function toPurchase(id: string, data: Record<string, unknown>): Purchase {
  return {
    id,
    supplierId: data.supplierId as string | undefined,
    supplierName: (data.supplierName as string) || "",
    items: (data.items as Purchase["items"]) || [],
    totalCost: (data.totalCost as number) || 0,
    paymentMethod: (data.paymentMethod as Purchase["paymentMethod"]) || "cash",
    invoiceNumber: data.invoiceNumber as string | undefined,
    receivedBy: (data.receivedBy as string) || "",
    note: data.note as string | undefined,
    storeId: (data.storeId as string) || "",
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(),
  };
}

export function purchasesCol(storeId: string) {
  return collection(db, "stores", storeId, "purchases");
}

export async function addPurchase(
  storeId: string,
  data: Omit<Purchase, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(purchasesCol(storeId), sanitizeFirestoreData({
    ...data,
    invoiceNumber: data.invoiceNumber || "",
    note: data.note || "",
    supplierId: data.supplierId || "",
    storeId,
    createdAt: serverTimestamp(),
  }));
  return ref.id;
}

export function subscribePurchases(
  storeId: string,
  callback: (purchases: Purchase[]) => void,
  limitCount = 50
): () => void {
  const q = query(
    purchasesCol(storeId),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => toPurchase(d.id, d.data())));
  });
}

export async function getPurchases(storeId: string): Promise<Purchase[]> {
  const q = query(purchasesCol(storeId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toPurchase(d.id, d.data()));
}

export async function deletePurchase(storeId: string, purchaseId: string): Promise<void> {
  await deleteDoc(doc(db, "stores", storeId, "purchases", purchaseId));
}

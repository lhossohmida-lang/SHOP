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
  getDocsFromCache,
  limit,
  doc,
  deleteDoc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeFirestoreData, runOfflineWrites } from "@/lib/firestore/helpers";
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
  const ref = await addDoc(salesCol(storeId), sanitizeFirestoreData({
    ...data,
    customerId: data.customerId || "",
    customerName: data.customerName || "",
    note: data.note || "",
    storeId,
    // Use client timestamp as fallback for offline mode
    createdAt: new Date(),
  }));
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

function filterSalesByDate(sales: Sale[], start: Date, end: Date): Sale[] {
  return sales.filter((s) => s.createdAt >= start && s.createdAt <= end);
}

async function querySalesOfflineFirst(
  storeId: string,
  start: Date,
  end: Date
): Promise<Sale[]> {
  const rangeQuery = query(
    salesCol(storeId),
    where("createdAt", ">=", start),
    where("createdAt", "<=", end),
    orderBy("createdAt", "desc")
  );

  try {
    const snap = typeof navigator !== "undefined" && !navigator.onLine
      ? await getDocsFromCache(rangeQuery)
      : await getDocs(rangeQuery);
    return snap.docs.map((d) => toSale(d.id, d.data()));
  } catch (error) {
    try {
      const allQuery = query(salesCol(storeId), orderBy("createdAt", "desc"));
      const snap = await getDocsFromCache(allQuery);
      return filterSalesByDate(
        snap.docs.map((d) => toSale(d.id, d.data())),
        start,
        end
      );
    } catch {
      return [];
    }
  }
}

export async function getSalesByDateRange(
  storeId: string,
  start: Date,
  end: Date
): Promise<Sale[]> {
  return querySalesOfflineFirst(storeId, start, end);
}

export async function deleteSaleAndRestoreStock(storeId: string, sale: Sale): Promise<void> {
  // Perform all operations without waiting - Firestore persistence handles the rest
  const operations = [];

  // 1. Restore product stocks
  for (const item of sale.items) {
    if (item.productId) {
      operations.push(async () => {
        const prodRef = doc(db, "stores", storeId, "products", item.productId);
        const prodSnap = await getDoc(prodRef);
        if (prodSnap.exists()) {
          const currentStock = (prodSnap.data().stock as number) || 0;
          await updateDoc(prodRef, {
            stock: currentStock + item.quantity,
            updatedAt: serverTimestamp(),
          });
        }
      });
    }
  }

  // 2. Adjust credit customer debt if paid by credit
  if (sale.paymentMethod === "credit" && sale.customerId) {
    operations.push(async () => {
      const custRef = doc(db, "stores", storeId, "creditCustomers", sale.customerId);
      const custSnap = await getDoc(custRef);
      if (custSnap.exists()) {
        const currentDebt = (custSnap.data().totalDebt as number) || 0;
        await updateDoc(custRef, {
          totalDebt: Math.max(0, currentDebt - sale.total),
          lastTransactionAt: serverTimestamp(),
        });
      }

      // 3. Delete corresponding credit transactions
      const txQuery = query(
        collection(db, "stores", storeId, "creditTransactions"),
        where("saleId", "==", sale.id)
      );
      const txSnap = await getDocs(txQuery);
      for (const d of txSnap.docs) {
        await deleteDoc(d.ref);
      }
    });
  }

  // 4. Delete the sale itself
  operations.push(async () => {
    const saleRef = doc(db, "stores", storeId, "sales", sale.id);
    await deleteDoc(saleRef);
  });

  // Run all operations in background - don't wait for completion
  runOfflineWrites(operations).catch((err) => {
    console.error("Error deleting sale:", err);
  });
}

export async function getSale(storeId: string, saleId: string): Promise<Sale | null> {
  const ref = doc(db, "stores", storeId, "sales", saleId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return toSale(snap.id, snap.data());
  }
  return null;
}


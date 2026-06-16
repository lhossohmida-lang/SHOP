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
  updateDoc,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeFirestoreData, runOfflineWrites, getDocOfflineFirst, getDocsOfflineFirst } from "@/lib/firestore/helpers";
import { getDoc } from "firebase/firestore";
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
  return onSnapshot(
    q,
    { includeMetadataChanges: false },
    (snap) => {
      callback(snap.docs.map((d) => toSale(d.id, d.data())));
    },
    (err) => {
      console.warn("[Sales] onSnapshot error (offline or permission):", err.code);
    }
  );
}

export async function getSalesToday(storeId: string): Promise<Sale[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const q = query(
    salesCol(storeId),
    where("createdAt", ">=", start),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocsOfflineFirst(q);
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
  // 1. استعادة مخزون كل صنف بـ increment ذرّي — يُطبَّق محلياً فوراً بدون انتظار الخادم
  for (const item of sale.items) {
    if (item.productId && item.quantity > 0) {
      updateDoc(doc(db, "stores", storeId, "products", item.productId), {
        stock: increment(item.quantity),
        updatedAt: serverTimestamp(),
      }).catch((e) => console.warn("[deleteSale] restoreStock failed:", e));
    }
  }

  // 2. تعديل دين الكريدي إن وُجد — increment سالب لتجنّب قراءة القيمة الحالية
  if (sale.paymentMethod === "credit" && sale.customerId) {
    updateDoc(doc(db, "stores", storeId, "creditCustomers", sale.customerId), {
      totalDebt: increment(-sale.total),
      lastTransactionAt: serverTimestamp(),
    }).catch((e) => console.warn("[deleteSale] creditDebt adjust failed:", e));

    // حذف معاملات الكريدي المرتبطة بالفاتورة (تحتاج قراءة — تُنفَّذ في الخلفية)
    getDocs(query(
      collection(db, "stores", storeId, "creditTransactions"),
      where("saleId", "==", sale.id)
    )).then((snap) => {
      snap.docs.forEach((d) => deleteDoc(d.ref).catch(() => {}));
    }).catch((e) => console.warn("[deleteSale] creditTx delete failed:", e));
  }

  // 3. حذف الفاتورة — يُطبَّق محلياً فوراً
  deleteDoc(doc(db, "stores", storeId, "sales", sale.id))
    .catch((e) => console.warn("[deleteSale] sale delete failed:", e));
}

/**
 * إرجاع جزئي: يُرجع كميات محددة من أصناف فاتورة (وليس كلها).
 * - يستعيد مخزون الأصناف المُرتجَعة فقط.
 * - يُحدّث أصناف الفاتورة وإجماليها (أو يحذفها إن أُرجعت كل الأصناف).
 * - إن كانت كريدي: يخصم قيمة المُرتجَع من دين العميل ويسجّل معاملة إرجاع.
 * كل عملية مستقلة حتى لا يُجهض فشل إحداها البقية.
 */
export async function returnSaleItems(
  storeId: string,
  sale: Sale,
  returns: { productId: string; quantity: number }[]
): Promise<{ returnedValue: number; allReturned: boolean }> {
  const returnMap = new Map(
    returns.filter((r) => r.quantity > 0).map((r) => [r.productId, r.quantity])
  );

  // احسب القيمة المُرتجَعة والأصناف المتبقية
  let returnedValue = 0;
  const newItems = sale.items
    .map((it) => {
      const rq = returnMap.get(it.productId) || 0;
      if (rq <= 0) return it;
      const ret = Math.min(rq, it.quantity);
      const unit = it.quantity > 0 ? it.totalPrice / it.quantity : it.unitPrice;
      returnedValue += unit * ret;
      const newQty = it.quantity - ret;
      return { ...it, quantity: newQty, totalPrice: unit * newQty };
    })
    .filter((it) => it.quantity > 0);

  const allReturned = newItems.length === 0;
  const newSubtotal = Math.max(0, sale.subtotal - returnedValue);
  const newTotal = Math.max(0, sale.total - returnedValue);

  const operations: Array<() => Promise<unknown>> = [];

  // 1) استعادة مخزون الأصناف المُرتجَعة فقط — increment ذرّي يُطبَّق محلياً فوراً
  for (const [productId, qty] of returnMap) {
    operations.push(() =>
      updateDoc(doc(db, "stores", storeId, "products", productId), {
        stock: increment(qty),
        updatedAt: serverTimestamp(),
      })
    );
  }

  // 2) تحديث الفاتورة أو حذفها إن أُرجع كل شيء
  operations.push(async () => {
    const saleRef = doc(db, "stores", storeId, "sales", sale.id);
    if (allReturned) {
      await deleteDoc(saleRef);
    } else {
      await updateDoc(saleRef, sanitizeFirestoreData({
        items: newItems,
        subtotal: newSubtotal,
        total: newTotal,
        updatedAt: serverTimestamp(),
      }));
    }
  });

  // 3) خصم قيمة المُرتجَع من دين العميل (كريدي) + تسجيل معاملة إرجاع
  if (sale.paymentMethod === "credit" && sale.customerId && returnedValue > 0) {
    operations.push(async () => {
      const custRef = doc(db, "stores", storeId, "creditCustomers", sale.customerId!);
      const custSnap = await getDoc(custRef);
      if (custSnap.exists()) {
        const currentDebt = (custSnap.data().totalDebt as number) || 0;
        const balanceAfter = Math.max(0, currentDebt - returnedValue);
        await updateDoc(custRef, {
          totalDebt: balanceAfter,
          lastTransactionAt: serverTimestamp(),
        });
        await addDoc(collection(db, "stores", storeId, "creditTransactions"), sanitizeFirestoreData({
          customerId: sale.customerId,
          customerName: sale.customerName || "",
          type: "payment", // الإرجاع يُقلّل الدين
          amount: returnedValue,
          balanceBefore: currentDebt,
          balanceAfter,
          saleId: sale.id,
          note: `إرجاع أصناف من الفاتورة ${sale.receiptNumber}`,
          storeId,
          createdAt: new Date(),
        }));
      }
    });
  }

  runOfflineWrites(operations).catch((err) => {
    console.error("Error returning sale items:", err);
  });

  return { returnedValue, allReturned };
}

export async function getSale(storeId: string, saleId: string): Promise<Sale | null> {
  const ref = doc(db, "stores", storeId, "sales", saleId);
  const snap = await getDocOfflineFirst(ref);
  if (snap.exists()) {
    return toSale(snap.id, snap.data());
  }
  return null;
}


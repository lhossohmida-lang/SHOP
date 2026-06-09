import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeFirestoreData } from "@/lib/firestore/helpers";
import type { Product, ProductFormData } from "@/types/product";

function toProduct(id: string, data: Record<string, unknown>): Product {
  return {
    id,
    name: (data.name as string) || "",
    nameAr: (data.nameAr as string) || "",
    barcode: (data.barcode as string) || "",
    category: (data.category as string) || "",
    purchasePrice: (data.purchasePrice as number) || 0,
    sellingPrice: (data.sellingPrice as number) || 0,
    stock: (data.stock as number) || 0,
    minStock: (data.minStock as number) || 0,
    unit: (data.unit as Product["unit"]) || "pcs",
    imageUrl: data.imageUrl as string | undefined,
    isActive: data.isActive !== false,
    storeId: (data.storeId as string) || "",
    expiryDate: data.expiryDate as string | undefined,
    updatedAt:
      data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : new Date(),
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(),
  };
}

export function productsCol(storeId: string) {
  return collection(db, "stores", storeId, "products");
}

export async function getProducts(storeId: string): Promise<Product[]> {
  const q = query(productsCol(storeId), where("isActive", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toProduct(d.id, d.data()));
}

export function subscribeProducts(
  storeId: string,
  callback: (products: Product[]) => void
): () => void {
  const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
  const q = query(productsCol(storeId), ...constraints);
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => toProduct(d.id, d.data())));
  });
}

export async function addProduct(
  storeId: string,
  data: ProductFormData
): Promise<string> {
  const ref = await addDoc(productsCol(storeId), sanitizeFirestoreData({
    ...data,
    storeId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function updateProduct(
  storeId: string,
  productId: string,
  data: Partial<ProductFormData>
): Promise<void> {
  await updateDoc(doc(productsCol(storeId), productId), sanitizeFirestoreData({
    ...data,
    updatedAt: serverTimestamp(),
  }));
}

export async function updateStock(
  storeId: string,
  productId: string,
  delta: number
): Promise<void> {
  const ref = doc(productsCol(storeId), productId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = (snap.data().stock as number) || 0;
  await updateDoc(ref, sanitizeFirestoreData({
    stock: current + delta,
    updatedAt: serverTimestamp(),
  }));
}

export async function deleteProduct(
  storeId: string,
  productId: string
): Promise<void> {
  await deleteDoc(doc(productsCol(storeId), productId));
}

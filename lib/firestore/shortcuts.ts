import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getDocOfflineFirst } from "@/lib/firestore/helpers";

export interface PosShortcuts {
  slots: (string | null)[]; // Array of 18 product IDs (null = empty)
}

const shortcutsDocRef = (storeId: string) =>
  doc(db, "stores", storeId);

export async function getPosShortcuts(storeId: string): Promise<PosShortcuts> {
  const snap = await getDocOfflineFirst(shortcutsDocRef(storeId));
  if (!snap.exists()) return { slots: Array(18).fill(null) };
  const data = snap.data();
  const slots = Array.isArray(data.shortcuts) ? data.shortcuts : Array(18).fill(null);
  // Ensure exactly 18 slots
  while (slots.length < 18) slots.push(null);
  return { slots: slots.slice(0, 18) };
}

export async function savePosShortcuts(storeId: string, slots: (string | null)[]): Promise<void> {
  await updateDoc(shortcutsDocRef(storeId), { shortcuts: slots });
}

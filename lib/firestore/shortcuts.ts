import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface PosShortcuts {
  slots: (string | null)[]; // Array of 9 product IDs (null = empty)
}

const shortcutsDocRef = (storeId: string) =>
  doc(db, "stores", storeId);

export async function getPosShortcuts(storeId: string): Promise<PosShortcuts> {
  const snap = await getDoc(shortcutsDocRef(storeId));
  if (!snap.exists()) return { slots: Array(9).fill(null) };
  const data = snap.data();
  const slots = Array.isArray(data.shortcuts) ? data.shortcuts : Array(9).fill(null);
  // Ensure exactly 9 slots
  while (slots.length < 9) slots.push(null);
  return { slots: slots.slice(0, 9) };
}

export async function savePosShortcuts(storeId: string, slots: (string | null)[]): Promise<void> {
  await updateDoc(shortcutsDocRef(storeId), { shortcuts: slots });
}

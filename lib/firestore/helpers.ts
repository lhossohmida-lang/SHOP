import {
  DocumentReference,
  DocumentSnapshot,
  Query,
  QuerySnapshot,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
} from "firebase/firestore";

/** Strip undefined values — Firestore rejects undefined fields. */
export function sanitizeFirestoreData<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

/**
 * Attempt to read a document from cache first.
 * If cached, resolves instantly. If not, falls back to server.
 */
export async function getDocOfflineFirst(ref: DocumentReference): Promise<DocumentSnapshot> {
  try {
    const snap = await getDocFromCache(ref);
    if (snap.exists()) {
      return snap;
    }
  } catch (e) {
    // Cache miss or cached version unavailable, fall back to server
  }
  return getDoc(ref);
}

/**
 * Attempt to read query documents from cache first.
 * If cached, resolves instantly. If not, falls back to server.
 */
export async function getDocsOfflineFirst(q: Query): Promise<QuerySnapshot> {
  try {
    const snap = await getDocsFromCache(q);
    if (!snap.empty) {
      return snap;
    }
  } catch (e) {
    // Cache miss or cached version unavailable, fall back to server
  }
  return getDocs(q);
}

/**
 * When offline or on a weak internet connection, Firestore queues writes locally,
 * but promises may not resolve quickly.
 * Proceed after a short timeout so the UI is not stuck on "Saving...".
 */
export async function offlineAwareAwait<T>(
  promise: Promise<T>,
  timeoutMs = 2500
): Promise<T | undefined> {
  // Always run the race to handle weak connections where isOffline() is false
  const result = await Promise.race([
    promise.then((value) => ({ done: true as const, value })),
    new Promise<{ done: false }>((resolve) =>
      setTimeout(() => resolve({ done: false }), timeoutMs)
    ),
  ]);

  if (result.done) return result.value;
  
  // If timed out, handle failure gracefully in the background
  promise.catch((err) => {
    console.warn("Background firestore write timed out or failed:", err);
  });
  return undefined;
}

/** Run several writes offline-tolerant (used for multi-step saves).
 * كل عملية مستقلة: فشل إحداها لا يُجهض البقية (مهم لإرجاع كل منتجات الفاتورة). */
export async function runOfflineWrites(
  operations: Array<() => Promise<unknown>>
): Promise<void> {
  for (const op of operations) {
    try {
      await offlineAwareAwait(op());
    } catch (err) {
      console.warn("[runOfflineWrites] operation failed (continuing):", err);
    }
  }
}

/**
 * Optimistic delete - marks local and continues without waiting for Firestore.
 * Firestore will sync when online.
 */
export async function offlineAwareDelete<T>(
  deletePromise: Promise<void>,
  onLocalDelete: () => void,
  timeoutMs = 1000
): Promise<void> {
  // Update UI immediately (optimistic)
  onLocalDelete();
  
  // Try to delete from Firestore in background
  Promise.race([
    deletePromise.then(() => {
      console.log("Delete synced to Firestore");
    }),
    new Promise<void>((resolve) =>
      setTimeout(() => {
        console.log("Delete operation continuing in background");
        resolve();
      }, timeoutMs)
    ),
  ]).catch((err) => {
    console.error("Background delete error (will retry):", err);
  });
}

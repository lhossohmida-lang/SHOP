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
 * When offline, Firestore queues writes locally but promises may not resolve quickly.
 * Proceed after a short timeout so the UI is not stuck on "جارٍ الحفظ...".
 */
export async function offlineAwareAwait<T>(
  promise: Promise<T>,
  timeoutMs = 2500
): Promise<T | undefined> {
  if (!isOffline()) return promise;

  const result = await Promise.race([
    promise.then((value) => ({ done: true as const, value })),
    new Promise<{ done: false }>((resolve) =>
      setTimeout(() => resolve({ done: false }), timeoutMs)
    ),
  ]);

  if (result.done) return result.value;
  promise.catch(() => {});
  return undefined;
}

/** Run several writes offline-tolerant (used for multi-step saves). */
export async function runOfflineWrites(
  operations: Array<() => Promise<unknown>>
): Promise<void> {
  for (const op of operations) {
    await offlineAwareAwait(op());
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

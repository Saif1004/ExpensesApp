const store = new Set<() => void>();

/**
 * Register a Firestore unsubscriber.
 * Returns a wrapped function that also removes it from the store when called.
 */
export function addListener(unsub: () => void): () => void {
  store.add(unsub);
  return () => {
    unsub();
    store.delete(unsub);
  };
}

/**
 * Detach every active listener immediately.
 * Call this before signOut so Firestore never gets a permission-denied window.
 */
export function unsubscribeAll() {
  store.forEach(fn => fn());
  store.clear();
}

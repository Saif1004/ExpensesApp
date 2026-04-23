const store = new Set<() => void>();

// registers a firestore unsubscriber and returns a self-cleaning wrapper
export function addListener(unsub: () => void): () => void {
  store.add(unsub);
  return () => {
    unsub();
    store.delete(unsub);
  };
}

// kills every active listener at once — call this before signing out
export function unsubscribeAll() {
  store.forEach(fn => fn());
  store.clear();
}

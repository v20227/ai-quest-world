export function createCollectionNotices() {
  const seenByWorld = new Map();
  const keyFor = namespace => `ai-quest-world-collection-notices:${namespace}`;
  function seen(namespace) {
    if (!seenByWorld.has(namespace)) seenByWorld.set(namespace, new Set());
    const values = seenByWorld.get(namespace);
    try {
      const stored = JSON.parse(localStorage.getItem(keyFor(namespace)) ?? "[]");
      if (Array.isArray(stored)) for (const id of stored) if (typeof id === "string") values.add(id);
    } catch { /* Keep this browser session's notification cursor. */ }
    return values;
  }
  return {
    pending(snapshot) {
      const namespace = snapshot?.display_namespace;
      if (!namespace) return [];
      return (snapshot.collection?.grants ?? []).filter(grant =>
        grant.item_id === "verified-memento" && !seen(namespace).has(grant.grant_id));
    },
    acknowledge(snapshot, grant) {
      const namespace = snapshot?.display_namespace;
      if (!namespace || !grant) return;
      const values = seen(namespace);
      values.add(grant.grant_id);
      try { localStorage.setItem(keyFor(namespace), JSON.stringify([...values])); }
      catch { /* Ownership remains stored by the backend. */ }
    }
  };
}

import { createKumoToastManager } from "@cloudflare/kumo/components/toast";
import { useSyncExternalStore } from "react";
import { db, legacyDocs, markLegacyMigrated } from "./db";
import type { Doc, Version } from "./types";

export const toasts = createKumoToastManager();

// A tiny observable value, readable from React via useSyncExternalStore.
export function observable<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useObservable<T>(o: ReturnType<typeof observable<T>>) {
  return useSyncExternalStore(o.subscribe, o.get);
}

const docs = observable<Doc[]>([]);
export const storeReady = observable(false);
let persistent = true;

function persist(doc: Doc) {
  if (!persistent) return;
  db.put(doc).catch((err) => {
    console.error("Could not save document", err);
    toasts.add({ title: "Could not save to browser storage", description: String(err?.message || err), variant: "error" });
  });
}

export const store = {
  subscribe: docs.subscribe,
  all: docs.get,
  get: (id: string | undefined) => (id ? docs.get().find((d) => d.id === id) : undefined),

  async init() {
    if (storeReady.get()) return;
    try {
      const saved = await db.all();
      const legacy = legacyDocs().filter((l) => !saved.some((d) => d.id === l.id));
      for (const doc of legacy) await db.put(doc);
      markLegacyMigrated();
      docs.set([...saved, ...legacy].map((d) => ({ ...d, jobs: d.jobs ?? [], tags: d.tags ?? [], notes: d.notes ?? "" })));
    } catch (err) {
      persistent = false;
      console.error("IndexedDB unavailable", err);
      toasts.add({
        title: "Browser storage unavailable",
        description: "Documents will be lost when you close this tab.",
        variant: "warning",
      });
    }
    storeReady.set(true);
  },

  create(text: string, title: string): Doc {
    const now = Date.now();
    const doc: Doc = {
      id: crypto.randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      versions: [{ id: crypto.randomUUID(), kind: "original", text, createdAt: now }],
      jobs: [],
      tags: [],
      notes: "",
    };
    docs.set([doc, ...docs.get()]);
    persist(doc);
    return doc;
  },

  update(id: string, fn: (doc: Doc) => Doc) {
    const current = docs.get();
    const doc = current.find((d) => d.id === id);
    if (!doc) return;
    const next = { ...fn(doc), updatedAt: Date.now() };
    docs.set(current.map((d) => (d.id === id ? next : d)));
    persist(next);
  },

  updateVersion(docId: string, versionId: string, patch: Partial<Version>) {
    store.update(docId, (d) => ({
      ...d,
      versions: d.versions.map((v) => (v.id === versionId ? { ...v, ...patch } : v)),
    }));
  },

  remove(id: string) {
    docs.set(docs.get().filter((d) => d.id !== id));
    if (persistent) db.delete(id).catch(console.error);
  },

  clear() {
    docs.set([]);
    if (persistent) db.clear().catch(console.error);
  },
};

export const useDocs = () => useSyncExternalStore(store.subscribe, store.all);
export const useDoc = (id: string | undefined) => {
  const all = useDocs();
  return id ? all.find((d) => d.id === id) : undefined;
};

export function versionLabel(doc: Doc, version: Version) {
  const i = doc.versions.findIndex((v) => v.id === version.id);
  return i <= 0 ? "Original" : `v${i}`;
}

export const KIND_LABELS: Record<Version["kind"], string> = {
  original: "Original",
  humanized: "Humanized",
  edited: "Edited",
};

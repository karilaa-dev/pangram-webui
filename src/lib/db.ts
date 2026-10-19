import type { Doc } from "./types";

// Documents live in IndexedDB: Pangram reports for several versions quickly
// outgrow localStorage's ~5 MB quota.
const DB_NAME = "zamwriter";
const STORE = "docs";
const LEGACY_HISTORY_KEY = "pangram_history";
const LEGACY_MIGRATED_KEY = "zamwriter_legacy_migrated";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  all: () => run<Doc[]>("readonly", (s) => s.getAll() as IDBRequest<Doc[]>),
  put: (doc: Doc) => run("readwrite", (s) => s.put(doc)),
  delete: (id: string) => run("readwrite", (s) => s.delete(id)),
  clear: () => run("readwrite", (s) => s.clear()),
};

// One-time import of checks saved by the previous Pangram-only UI.
export function legacyDocs(): Doc[] {
  try {
    if (localStorage.getItem(LEGACY_MIGRATED_KEY)) return [];
    const entries = JSON.parse(localStorage.getItem(LEGACY_HISTORY_KEY) || "[]");
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((e) => e && typeof e.text === "string" && e.apiResponse)
      .map((e) => ({
        id: String(e.id || crypto.randomUUID()),
        title: e.title || e.text.trim().split(/\s+/).slice(0, 8).join(" "),
        createdAt: e.timestamp || Date.now(),
        updatedAt: e.timestamp || Date.now(),
        tags: Array.isArray(e.tags) ? e.tags : [],
        notes: e.notes || "",
        jobs: [],
        versions: [
          {
            id: crypto.randomUUID(),
            kind: "original" as const,
            text: e.text,
            createdAt: e.timestamp || Date.now(),
            pangram: {
              model: e.apiResponse.model || "default",
              checkedAt: e.timestamp || Date.now(),
              result: e.apiResponse,
            },
            plagiarism: e.plagiarism || undefined,
          },
        ],
      }));
  } catch {
    return [];
  }
}

export function markLegacyMigrated() {
  try {
    localStorage.setItem(LEGACY_MIGRATED_KEY, "1");
  } catch {}
}

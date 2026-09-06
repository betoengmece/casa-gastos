import type { AuditEntry, Expense } from "./model";

const DB_NAME = "casa-gastos";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("expenses")) db.createObjectStore("expenses", { keyPath: "id" });
      if (!db.objectStoreNames.contains("audit")) db.createObjectStore("audit", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function all<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function replace<T>(store: string, rows: T[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    objectStore.clear();
    rows.forEach((row) => objectStore.put(row));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const localDB = {
  loadExpenses: () => all<Expense>("expenses"),
  saveExpenses: (rows: Expense[]) => replace("expenses", rows),
  loadAudit: () => all<AuditEntry>("audit"),
  saveAudit: (rows: AuditEntry[]) => replace("audit", rows),
};

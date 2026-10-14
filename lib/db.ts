// ============================================================
// Client-side IndexedDB storage for chat sessions & multi-turn history
// Pure offline-first browser storage with zero external dependencies
// ============================================================

export interface TurnResponse {
  model: string;
  text: string;
  error?: string;
  durationMs: number;
}

export interface ChatTurn {
  id: string;
  prompt: string;
  timestamp: number;
  columnResponses: [TurnResponse, TurnResponse, TurnResponse];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  columnModels: [string, string, string];
  turns: ChatTurn[];
}

const DB_NAME = "ai_tri_arena_db";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Get all chat sessions sorted by most recent */
export async function getAllSessions(): Promise<ChatSession[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const list: ChatSession[] = request.result || [];
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Get a single session by ID */
export async function getSession(id: string): Promise<ChatSession | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Save or update a session */
export async function saveSession(session: ChatSession): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(session);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Delete a single session */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Clear all stored data from IndexedDB */
export async function clearAllSessions(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

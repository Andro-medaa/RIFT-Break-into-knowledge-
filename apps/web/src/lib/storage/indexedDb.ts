import { LessonSegment } from '../../types/lesson';
import { DocumentMeta, DocumentChunk } from '../../types/api';

export interface SavedSessionData {
  sessionId: string;
  docId: string;
  docTitle: string;
  docMeta?: DocumentMeta;
  chunks?: DocumentChunk[];
  segOrd: number;
  sentIdx: number;
  segments: LessonSegment[];
  updatedAt: number;
}

const DB_NAME = 'rift_db';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in current environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('docId', 'docId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSessionCursor(session: SavedSessionData): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const dataToSave: SavedSessionData = {
        ...session,
        updatedAt: Date.now(),
      };
      const req = store.put(dataToSave);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Non-fatal fallback: localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(`rift_last_session`, JSON.stringify(session));
      } catch {
        // quota exceeded or private mode
      }
    }
  }
}

export async function getLatestSession(): Promise<SavedSessionData | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('updatedAt');
      const req = index.openCursor(null, 'prev'); // Most recently updated

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          resolve(cursor.value as SavedSessionData);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Fallback to localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(`rift_last_session`);
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}

export async function clearSavedSession(sessionId?: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (sessionId) {
        store.delete(sessionId);
      } else {
        store.clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(`rift_last_session`);
    }
  }
}

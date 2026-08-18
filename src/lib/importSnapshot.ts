import type { AppConfig } from '../types';

const IMPORT_SNAPSHOT_FALLBACK_KEY = 'yue-launcher-import-rollback-v1';
const IMPORT_SNAPSHOT_DB_NAME = 'yue-launcher-snapshots';
const IMPORT_SNAPSHOT_STORE = 'snapshots';
const IMPORT_SNAPSHOT_ID = 'last-import';

export interface ImportRollbackSnapshot {
  id?: string;
  createdAt: number;
  sourceName?: string;
  config: AppConfig;
}

function openSnapshotDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 不可用'));
    const request = indexedDB.open(IMPORT_SNAPSHOT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMPORT_SNAPSHOT_STORE)) db.createObjectStore(IMPORT_SNAPSHOT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打开导入快照数据库失败'));
  });
}

async function saveToIndexedDb(snapshot: ImportRollbackSnapshot) {
  const db = await openSnapshotDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(IMPORT_SNAPSHOT_STORE, 'readwrite');
      transaction.objectStore(IMPORT_SNAPSHOT_STORE).put({ ...snapshot, id: IMPORT_SNAPSHOT_ID });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('写入导入快照失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('写入导入快照被中止'));
    });
  } finally {
    db.close();
  }
}

async function loadFromIndexedDb(): Promise<ImportRollbackSnapshot | null> {
  const db = await openSnapshotDb();
  try {
    return await new Promise<ImportRollbackSnapshot | null>((resolve, reject) => {
      const transaction = db.transaction(IMPORT_SNAPSHOT_STORE, 'readonly');
      const request = transaction.objectStore(IMPORT_SNAPSHOT_STORE).get(IMPORT_SNAPSHOT_ID);
      request.onsuccess = () => resolve(request.result ? request.result as ImportRollbackSnapshot : null);
      request.onerror = () => reject(request.error ?? new Error('读取导入快照失败'));
    });
  } finally {
    db.close();
  }
}

function saveFallback(snapshot: ImportRollbackSnapshot) {
  localStorage.setItem(IMPORT_SNAPSHOT_FALLBACK_KEY, JSON.stringify(snapshot));
}

function loadFallback(): ImportRollbackSnapshot | null {
  try {
    const raw = localStorage.getItem(IMPORT_SNAPSHOT_FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImportRollbackSnapshot>;
    if (!parsed.config || typeof parsed.createdAt !== 'number') return null;
    return parsed as ImportRollbackSnapshot;
  } catch {
    return null;
  }
}

/** IndexedDB is preferred because launcher configs may contain large icon/image data. */
export async function saveImportRollbackSnapshot(config: AppConfig, sourceName?: string) {
  const snapshot: ImportRollbackSnapshot = { createdAt: Date.now(), sourceName, config };
  try {
    await saveToIndexedDb(snapshot);
    try { localStorage.removeItem(IMPORT_SNAPSHOT_FALLBACK_KEY); } catch {}
    return snapshot;
  } catch (indexedDbError) {
    try {
      saveFallback(snapshot);
      return snapshot;
    } catch (fallbackError) {
      throw new Error(`IndexedDB：${String(indexedDbError)}；localStorage：${String(fallbackError)}`);
    }
  }
}

export async function loadImportRollbackSnapshot(): Promise<ImportRollbackSnapshot | null> {
  try {
    const indexed = await loadFromIndexedDb();
    if (indexed) return indexed;
  } catch {}
  return loadFallback();
}

export async function clearImportRollbackSnapshot() {
  try {
    const db = await openSnapshotDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(IMPORT_SNAPSHOT_STORE, 'readwrite');
        transaction.objectStore(IMPORT_SNAPSHOT_STORE).delete(IMPORT_SNAPSHOT_ID);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('删除导入快照失败'));
      });
    } finally {
      db.close();
    }
  } catch {}
  try { localStorage.removeItem(IMPORT_SNAPSHOT_FALLBACK_KEY); } catch {}
}

import type { AppConfig } from '../types';

export interface ConfigProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sourceName?: string;
}

interface ConfigProfileRecord {
  id: string;
  config: AppConfig;
}

const DB_NAME = 'yue-launcher-config-profiles';
const DB_VERSION = 1;
const META_STORE = 'profiles';
const CONFIG_STORE = 'profile-configs';
const ACTIVE_PROFILE_KEY = 'yue-launcher-active-profile-id';
const DEFAULT_PROFILE_ID = 'default-release';

let dbPromise: Promise<IDBDatabase> | null = null;

function getLocalStorageSafe(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function requireIndexedDb() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('当前环境不支持 IndexedDB，无法使用多配置。');
  }
  return indexedDB;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = requireIndexedDb().open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CONFIG_STORE)) db.createObjectStore(CONFIG_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('打开配置数据库失败'));
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('配置数据库正在被另一个窗口占用，请稍后重试。'));
    };
  });
  return dbPromise;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('配置数据库操作失败'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('配置数据库事务失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('配置数据库事务已取消'));
  });
}

function makeProfileId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `profile-${crypto.randomUUID()}`;
  } catch {
    // Fall back to timestamp/random below.
  }
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeProfileName(value: string, fallback = '未命名配置') {
  const clean = String(value ?? '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean || fallback;
}

export function makeUniqueProfileName(baseName: string, existingNames: Iterable<string>) {
  const base = normalizeProfileName(baseName, '导入配置');
  const used = new Set(Array.from(existingNames, (name) => name.trim().toLocaleLowerCase('zh-CN')));
  if (!used.has(base.toLocaleLowerCase('zh-CN'))) return base;
  let suffix = 2;
  while (used.has(`${base} (${suffix})`.toLocaleLowerCase('zh-CN'))) suffix += 1;
  return `${base} (${suffix})`;
}

export function getActiveConfigProfileId() {
  return getLocalStorageSafe()?.getItem(ACTIVE_PROFILE_KEY) || null;
}

export function setActiveConfigProfileId(id: string) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch {
    // The active id is only a small hint; profile data remains in IndexedDB.
  }
}

async function getConfigProfileMeta(id: string): Promise<ConfigProfileMeta | null> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, 'readonly');
  const record = await requestValue(tx.objectStore(META_STORE).get(id)) as ConfigProfileMeta | undefined;
  return record ?? null;
}

export async function listConfigProfiles(): Promise<ConfigProfileMeta[]> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, 'readonly');
  const rows = await requestValue(tx.objectStore(META_STORE).getAll()) as ConfigProfileMeta[];
  return rows.sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name, 'zh-CN'));
}

export async function getConfigProfileConfig(id: string): Promise<AppConfig | null> {
  const db = await openDb();
  const tx = db.transaction(CONFIG_STORE, 'readonly');
  const record = await requestValue(tx.objectStore(CONFIG_STORE).get(id)) as ConfigProfileRecord | undefined;
  return record?.config ?? null;
}

export async function createConfigProfile(
  name: string,
  config: AppConfig,
  options: { id?: string; sourceName?: string } = {},
): Promise<ConfigProfileMeta> {
  const db = await openDb();
  const now = Date.now();
  const meta: ConfigProfileMeta = {
    id: options.id || makeProfileId(),
    name: normalizeProfileName(name),
    createdAt: now,
    updatedAt: now,
    sourceName: options.sourceName,
  };
  const tx = db.transaction([META_STORE, CONFIG_STORE], 'readwrite');
  const done = transactionDone(tx);
  tx.objectStore(META_STORE).put(meta);
  tx.objectStore(CONFIG_STORE).put({ id: meta.id, config } satisfies ConfigProfileRecord);
  await done;
  return meta;
}

export async function saveConfigProfileConfig(id: string, config: AppConfig): Promise<ConfigProfileMeta> {
  const existing = await getConfigProfileMeta(id);
  if (!existing) throw new Error('当前配置记录不存在，请刷新配置列表后重试。');
  const db = await openDb();
  const tx = db.transaction([META_STORE, CONFIG_STORE], 'readwrite');
  const done = transactionDone(tx);
  const nextMeta = { ...existing, updatedAt: Date.now() };
  tx.objectStore(META_STORE).put(nextMeta);
  tx.objectStore(CONFIG_STORE).put({ id, config } satisfies ConfigProfileRecord);
  await done;
  return nextMeta;
}

export async function renameConfigProfile(id: string, name: string): Promise<ConfigProfileMeta> {
  const existing = await getConfigProfileMeta(id);
  if (!existing) throw new Error('配置不存在。');
  const db = await openDb();
  const tx = db.transaction(META_STORE, 'readwrite');
  const done = transactionDone(tx);
  const next = { ...existing, name: normalizeProfileName(name), updatedAt: Date.now() };
  tx.objectStore(META_STORE).put(next);
  await done;
  return next;
}

export async function deleteConfigProfile(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([META_STORE, CONFIG_STORE], 'readwrite');
  const done = transactionDone(tx);
  tx.objectStore(META_STORE).delete(id);
  tx.objectStore(CONFIG_STORE).delete(id);
  await done;
}

export async function ensureInitialConfigProfile(currentConfig: AppConfig): Promise<{ profiles: ConfigProfileMeta[]; activeId: string }> {
  const profiles = await listConfigProfiles();
  const activeId = getActiveConfigProfileId();
  if (profiles.length === 0) {
    const meta = await createConfigProfile('default-release', currentConfig, { id: activeId || DEFAULT_PROFILE_ID });
    setActiveConfigProfileId(meta.id);
    return { profiles: [meta], activeId: meta.id };
  }
  if (activeId && profiles.some((profile) => profile.id === activeId)) return { profiles, activeId };

  // If profile storage exists but the tiny active-id key was lost, preserve the current working
  // configuration as a recovered profile instead of overwriting an existing saved profile.
  const recoveredName = makeUniqueProfileName('当前配置', profiles.map((profile) => profile.name));
  const recovered = await createConfigProfile(recoveredName, currentConfig);
  setActiveConfigProfileId(recovered.id);
  return { profiles: [...profiles, recovered], activeId: recovered.id };
}

const DB_NAME = 'planr-file-handles';
const STORE_NAME = 'handles';
const MOUNTED_FILE_KEY = 'mounted-project-file';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => reject(tx.error);
  });
}

export async function persistMountedFileHandle(handle) {
  if (!handle) return;
  await withStore('readwrite', store => store.put(handle, MOUNTED_FILE_KEY));
}

export async function loadMountedFileHandle() {
  return withStore('readonly', store => store.get(MOUNTED_FILE_KEY));
}

export async function clearMountedFileHandle() {
  await withStore('readwrite', store => store.delete(MOUNTED_FILE_KEY));
}

export async function queryHandlePermission(handle, mode = 'read') {
  if (!handle?.queryPermission) return 'granted';
  try {
    return await handle.queryPermission({ mode });
  } catch {
    return 'prompt';
  }
}

export async function requestHandlePermission(handle, mode = 'readwrite') {
  if (!handle?.requestPermission) return 'granted';
  try {
    return await handle.requestPermission({ mode });
  } catch {
    return 'denied';
  }
}

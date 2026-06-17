const DB_NAME = 'portfolio-studio-db';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'project-root';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, callback) {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = callback(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

export function supportsPersistentHandles() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

export function saveProjectHandle(handle) {
  return withStore('readwrite', (store) => store.put(handle, HANDLE_KEY));
}

export function loadProjectHandle() {
  return withStore('readonly', (store) => store.get(HANDLE_KEY));
}

export async function ensureProjectPermission(handle) {
  if (!handle?.queryPermission) {
    return false;
  }

  const options = { mode: 'readwrite' };
  const current = await handle.queryPermission(options);
  if (current === 'granted') {
    return true;
  }

  if (current === 'prompt') {
    const requested = await handle.requestPermission(options);
    return requested === 'granted';
  }

  return false;
}

// SnapSplit — IndexedDB persistence layer. Everything stays on-device.
'use strict';

const SnapDB = (() => {
  const DB_NAME = 'snapsplit';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('receipts')) {
          db.createObjectStore('receipts', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('splits')) {
          const store = db.createObjectStore('splits', { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('imageHash', 'imageHash');
        }
        if (!db.objectStoreNames.contains('participants')) {
          db.createObjectStore('participants', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('groups')) {
          db.createObjectStore('groups', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('trips')) {
          db.createObjectStore('trips', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const result = fn(store);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(storeName, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      t.objectStore(storeName).put(value);
      t.oncomplete = () => resolve(value);
      t.onerror = () => reject(t.error);
    });
  }

  async function get(storeName, key) {
    const db = await open();
    const t = db.transaction(storeName, 'readonly');
    return reqToPromise(t.objectStore(storeName).get(key));
  }

  async function getAll(storeName) {
    const db = await open();
    const t = db.transaction(storeName, 'readonly');
    const all = await reqToPromise(t.objectStore(storeName).getAll());
    return all || [];
  }

  async function del(storeName, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      t.objectStore(storeName).delete(key);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  async function clearStore(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      t.objectStore(storeName).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  async function deleteAllData() {
    const stores = ['receipts', 'splits', 'participants', 'groups', 'trips', 'settings', 'images'];
    for (const s of stores) await clearStore(s);
  }

  // Simple perceptual-ish hash for duplicate detection: downsizes to 16x16
  // grayscale, averages, produces a 256-bit signature. Good enough to catch
  // "same photo imported twice", not a general dedup solution.
  async function hashImageBlob(blob) {
    const bitmap = await createImageBitmap(blob);
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let sum = 0;
    const gray = [];
    for (let i = 0; i < data.length; i += 4) {
      const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      gray.push(g);
      sum += g;
    }
    const avg = sum / gray.length;
    let hash = '';
    for (const g of gray) hash += g >= avg ? '1' : '0';
    // pack bits into hex
    let hex = '';
    for (let i = 0; i < hash.length; i += 4) {
      hex += parseInt(hash.slice(i, i + 4).padEnd(4, '0'), 2).toString(16);
    }
    return hex;
  }

  function hammingDistanceHex(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
      let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) { dist += x & 1; x >>= 1; }
    }
    return dist;
  }

  return { open, put, get, getAll, del, clearStore, deleteAllData, hashImageBlob, hammingDistanceHex };
})();

import { extractZipList, ZIPCODES_US_VERSION } from "./zipPackage.js";
import { getZipSet, setZipIndex } from "./zipIndex.js";

export const ZIP_DB_NAME = "elles-jam-shop";
export const ZIP_STORE = "zips";
export const ZIP_RECORD_KEY = "us";

let inflight = null;
let loadZipcodesModule = () => import("zipcodes-us");

export function setLoadZipcodesModuleForTests(loader) {
  loadZipcodesModule =
    typeof loader === "function" ? loader : () => import("zipcodes-us");
}

export function resetZipCacheForTests() {
  inflight = null;
  setZipIndex(null);
}

function openZipDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const request = indexedDB.open(ZIP_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ZIP_STORE)) {
        db.createObjectStore(ZIP_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readCachedRecord() {
  try {
    const db = await openZipDb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ZIP_STORE, "readonly");
      const request = tx.objectStore(ZIP_STORE).get(ZIP_RECORD_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function writeCachedRecord(record) {
  try {
    const db = await openZipDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ZIP_STORE, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.objectStore(ZIP_STORE).put(record, ZIP_RECORD_KEY);
    });
  } catch {
    // Private mode or missing IndexedDB: keep the in-memory Set only.
  }
}

async function loadZipsFromPackage() {
  const moduleOrApi = await loadZipcodesModule();
  return extractZipList(moduleOrApi);
}

async function hydrateZipIndex() {
  const cached = await readCachedRecord();
  if (
    cached?.version === ZIPCODES_US_VERSION &&
    Array.isArray(cached.zips) &&
    cached.zips.length > 0
  ) {
    setZipIndex(cached.zips);
    return getZipSet();
  }

  const zips = await loadZipsFromPackage();
  setZipIndex(zips);
  await writeCachedRecord({ version: ZIPCODES_US_VERSION, zips });
  return getZipSet();
}

export async function ensureZipIndex() {
  if (getZipSet() != null) return getZipSet();
  if (!inflight) {
    inflight = hydrateZipIndex().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

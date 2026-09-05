import "fake-indexeddb/auto";
import { ZIPCODES_US_VERSION } from "../zipPackage.js";
import { getZipSet } from "../zipIndex.js";
import {
  ZIP_DB_NAME,
  ZIP_RECORD_KEY,
  ZIP_STORE,
  ensureZipIndex,
  resetZipCacheForTests,
  setLoadZipcodesModuleForTests,
} from "../zipCache.js";

function mockZipcodes(validZips) {
  const valid = new Set(validZips);
  return {
    find: (zip) => ({ isValid: valid.has(zip) }),
  };
}

function deleteZipDb() {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(ZIP_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function seedZipDb(record) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ZIP_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ZIP_STORE)) {
        db.createObjectStore(ZIP_STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(ZIP_STORE, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.objectStore(ZIP_STORE).put(record, ZIP_RECORD_KEY);
    };
  });
}

function readZipDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ZIP_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(ZIP_STORE, "readonly");
      const get = tx.objectStore(ZIP_STORE).get(ZIP_RECORD_KEY);
      get.onsuccess = () => {
        const value = get.result ?? null;
        db.close();
        resolve(value);
      };
      get.onerror = () => reject(get.error);
    };
  });
}

beforeEach(async () => {
  resetZipCacheForTests();
  setLoadZipcodesModuleForTests();
  await deleteZipDb();
});

test("matching version hydrates from IndexedDB without importing zipcodes-us", async () => {
  const load = jest.fn(() => Promise.resolve(mockZipcodes(["60601"])));
  setLoadZipcodesModuleForTests(load);
  await seedZipDb({
    version: ZIPCODES_US_VERSION,
    zips: ["37919"],
  });

  await ensureZipIndex();

  expect(load).not.toHaveBeenCalled();
  expect(getZipSet().has("37919")).toBe(true);
  expect(getZipSet().has("60601")).toBe(false);
});

test("a different version replaces the IndexedDB record from zipcodes-us", async () => {
  const load = jest.fn(() => Promise.resolve(mockZipcodes(["60601"])));
  setLoadZipcodesModuleForTests(load);
  await seedZipDb({
    version: "0.0.0",
    zips: ["37919"],
  });

  await ensureZipIndex();

  expect(load).toHaveBeenCalledTimes(1);
  expect(getZipSet().has("60601")).toBe(true);
  expect(getZipSet().has("37919")).toBe(false);
  await expect(readZipDb()).resolves.toEqual({
    version: ZIPCODES_US_VERSION,
    zips: ["60601"],
  });
});

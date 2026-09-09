const DB_NAME = 'baseera-offline-db';
const DB_VERSION = 1;

// In-memory fallback stores for environments without IndexedDB (e.g. tests, SSR, private mode)
const memoryStores = {
  surveys: new Map(),
  precallConfigs: new Map(),
  offlinePrecalls: new Map(),
  offlineResponses: new Map(),
  drafts: new Map(),
  cachedNumbers: new Map(),
};

function isIndexedDBAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch (_) {
    return false;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error('IndexedDB is not available in this environment'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target?.error || event);
      reject(event.target?.error || new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store survey definitions (keyed by _id)
      if (!db.objectStoreNames.contains('surveys')) {
        db.createObjectStore('surveys', { keyPath: '_id' });
      }

      // Store precall checklist configurations (keyed by surveyId)
      if (!db.objectStoreNames.contains('precallConfigs')) {
        db.createObjectStore('precallConfigs', { keyPath: 'surveyId' });
      }

      // Store offline completed precall checklists (keyed by serialNumber)
      if (!db.objectStoreNames.contains('offlinePrecalls')) {
        db.createObjectStore('offlinePrecalls', { keyPath: 'serialNumber' });
      }

      // Store offline completed responses (keyed by serialNumber)
      if (!db.objectStoreNames.contains('offlineResponses')) {
        db.createObjectStore('offlineResponses', { keyPath: 'serialNumber' });
      }

      // Store local draft survey answers (keyed by serialNumber)
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'serialNumber' });
      }

      // Store cached outbound phone numbers
      if (!db.objectStoreNames.contains('cachedNumbers')) {
        db.createObjectStore('cachedNumbers', { keyPath: '_id' });
      }
    };
  });
}

function getKey(storeName, item) {
  if (!item) return null;
  const keyPath = storeName === 'precallConfigs'
    ? 'surveyId'
    : (storeName === 'surveys' || storeName === 'cachedNumbers')
      ? '_id'
      : 'serialNumber';
  return item[keyPath] || item.id || item._id || JSON.stringify(item);
}

// Helper generic functions with transparent in-memory fallback
async function putItem(storeName, item) {
  if (!isIndexedDBAvailable()) {
    const key = getKey(storeName, item);
    if (key && memoryStores[storeName]) memoryStores[storeName].set(key, item);
    return true;
  }
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (_) {
    const key = getKey(storeName, item);
    if (key && memoryStores[storeName]) memoryStores[storeName].set(key, item);
    return true;
  }
}

async function getItem(storeName, key) {
  if (!isIndexedDBAvailable()) {
    return memoryStores[storeName]?.get(key) || null;
  }
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (_) {
    return memoryStores[storeName]?.get(key) || null;
  }
}

async function getAllItems(storeName) {
  if (!isIndexedDBAvailable()) {
    return memoryStores[storeName] ? Array.from(memoryStores[storeName].values()) : [];
  }
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (_) {
    return memoryStores[storeName] ? Array.from(memoryStores[storeName].values()) : [];
  }
}

async function deleteItem(storeName, key) {
  if (!isIndexedDBAvailable()) {
    if (memoryStores[storeName]) memoryStores[storeName].delete(key);
    return true;
  }
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (_) {
    if (memoryStores[storeName]) memoryStores[storeName].delete(key);
    return true;
  }
}

async function clearStore(storeName) {
  if (!isIndexedDBAvailable()) {
    if (memoryStores[storeName]) memoryStores[storeName].clear();
    return true;
  }
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (_) {
    if (memoryStores[storeName]) memoryStores[storeName].clear();
    return true;
  }
}

// Exported high-level database operations
export const offlineDb = {
  // Survey Definitions
  saveSurveyDef: (survey) => putItem('surveys', survey),
  getSurveyDef: (surveyId) => getItem('surveys', surveyId),
  getAllSurveys: () => getAllItems('surveys'),

  // Precall Configs
  savePrecallConfig: (config) => putItem('precallConfigs', config),
  getPrecallConfig: (surveyId) => getItem('precallConfigs', surveyId || 'global'),

  // Offline Completed Precalls (Queue)
  saveOfflinePrecall: (precall) => putItem('offlinePrecalls', precall),
  getOfflinePrecalls: () => getAllItems('offlinePrecalls'),
  deleteOfflinePrecall: (serialNumber) => deleteItem('offlinePrecalls', serialNumber),

  // Offline Completed Responses (Queue)
  saveOfflineResponse: (response) => putItem('offlineResponses', response),
  getOfflineResponses: () => getAllItems('offlineResponses'),
  deleteOfflineResponse: (serialNumber) => deleteItem('offlineResponses', serialNumber),

  // Local Drafts
  saveLocalDraft: (draft) => putItem('drafts', draft),
  getLocalDraft: (serialNumber) => getItem('drafts', serialNumber),
  deleteLocalDraft: (serialNumber) => deleteItem('drafts', serialNumber),

  // Cached Outbound Phone Numbers
  saveCachedNumber: (numberObj) => putItem('cachedNumbers', numberObj),
  getCachedNumbers: () => getAllItems('cachedNumbers'),
  deleteCachedNumber: (numberId) => deleteItem('cachedNumbers', numberId),
  clearCachedNumbers: () => clearStore('cachedNumbers'),
};

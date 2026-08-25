const DB_NAME = 'baseera-offline-db';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
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

// Helper generic functions
async function putItem(storeName, item) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function getItem(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllItems(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
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

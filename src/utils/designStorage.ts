import type { DesignDocument } from '../types';
import { normalizeDesign } from './designMigration';

const DB_NAME = 'whole-home-designer';
const DB_VERSION = 1;
const STORE_NAME = 'designs';

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const saveDesign = async (design: DesignDocument) => {
  const database = await openDatabase();
  const documentToSave = {
    ...normalizeDesign(design),
    updatedAt: new Date().toISOString()
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(documentToSave);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  database.close();
  return documentToSave;
};

export const getDesign = async (id: string) => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const design = await requestToPromise<DesignDocument | undefined>(transaction.objectStore(STORE_NAME).get(id));
  database.close();
  return design ? normalizeDesign(design) : undefined;
};

export const listDesigns = async () => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const designs = await requestToPromise<DesignDocument[]>(transaction.objectStore(STORE_NAME).getAll());
  database.close();

  return designs.map(normalizeDesign).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
};

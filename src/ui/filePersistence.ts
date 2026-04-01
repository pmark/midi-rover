const DB_NAME = 'midi-rover-ui';
const DB_VERSION = 1;
const STORE_NAME = 'persisted-midi';
const RECORD_KEY = 'last-loaded-midi';

type PersistedMidiRecord = {
  id: string;
  name: string;
  type: string;
  bytes: ArrayBuffer;
  savedAt: number;
};

const openDatabase = async (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open MIDI persistence database.'));
  });

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void,
): Promise<T> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => {
      database.close();
    };

    transaction.onabort = () => {
      reject(transaction.error ?? new Error('MIDI persistence transaction aborted.'));
      database.close();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('MIDI persistence transaction failed.'));
      database.close();
    };

    operation(store, resolve, reject);
  });
};

export const persistLoadedMidiFile = async (file: File): Promise<void> => {
  const bytes = await file.arrayBuffer();

  await runTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.put({
      id: RECORD_KEY,
      name: file.name,
      type: file.type,
      bytes,
      savedAt: Date.now(),
    } satisfies PersistedMidiRecord);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to persist MIDI file.'));
  });
};

export const restorePersistedMidiFile = async (): Promise<File | null> => {
  const record = await runTransaction<PersistedMidiRecord | null>('readonly', (store, resolve, reject) => {
    const request = store.get(RECORD_KEY);

    request.onsuccess = () => {
      const result = request.result as PersistedMidiRecord | undefined;
      resolve(result ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read persisted MIDI file.'));
  });

  if (!record) {
    return null;
  }

  return new File([record.bytes], record.name, {
    type: record.type || 'audio/midi',
    lastModified: record.savedAt,
  });
};

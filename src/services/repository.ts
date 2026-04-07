import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { Nurse, ScheduledVisit, SyncProvider, UserArchiveRecord, UserRecord } from '../types';
import { getFirebaseServices } from './firebaseApp';
import { currentSyncProvider, isDemoMode } from './appEnv';
import { loadFromStorage, saveToStorage } from './persistence';

export interface RealtimeRepo<T extends { id?: string; slotId?: string }> {
  list(): Promise<T[]>;
  upsert(item: T): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  subscribe(onChange: (items: T[]) => void): () => void;
}

function itemId<T extends { id?: string; slotId?: string }>(item: T): string {
  return item.id ?? item.slotId ?? crypto.randomUUID();
}

function createLocalRepo<T extends { id?: string; slotId?: string }>(storageKey: string): RealtimeRepo<T> {
  return {
    async list() {
      return loadFromStorage<T[]>(storageKey, []);
    },
    async upsert(item) {
      const items = loadFromStorage<T[]>(storageKey, []);
      const id = itemId(item);
      const next = items.filter((entry) => itemId(entry) !== id).concat(item);
      saveToStorage(storageKey, next);
      window.dispatchEvent(new CustomEvent(storageKey));
    },
    async remove(id) {
      const items = loadFromStorage<T[]>(storageKey, []).filter((entry) => itemId(entry) !== id);
      saveToStorage(storageKey, items);
      window.dispatchEvent(new CustomEvent(storageKey));
    },
    async clear() {
      saveToStorage(storageKey, []);
      window.dispatchEvent(new CustomEvent(storageKey));
    },
    subscribe(onChange) {
      const handler = () => onChange(loadFromStorage<T[]>(storageKey, []));
      window.addEventListener(storageKey, handler);
      handler();
      return () => window.removeEventListener(storageKey, handler);
    }
  };
}

function createFirebaseRepo<T extends { id?: string; slotId?: string }>(collectionName: string): RealtimeRepo<T> | null {
  const services = getFirebaseServices();
  if (!services) return null;
  const col = collection(services.db, collectionName);
  return {
    async list() {
      const snapshot = await getDocs(col);
      return snapshot.docs.map((docItem) => docItem.data() as T);
    },
    async upsert(item) {
      await setDoc(doc(services.db, collectionName, itemId(item)), item, { merge: true });
    },
    async remove(id) {
      await deleteDoc(doc(services.db, collectionName, id));
    },
    async clear() {
      const snapshot = await getDocs(col);
      await Promise.all(snapshot.docs.map((docItem) => deleteDoc(docItem.ref)));
    },
    subscribe(onChange) {
      return onSnapshot(col, (snapshot) => {
        onChange(snapshot.docs.map((docItem) => docItem.data() as T));
      });
    }
  };
}

export function repoProvider(): SyncProvider {
  return currentSyncProvider();
}

export function createScheduleRepo(): RealtimeRepo<ScheduledVisit> {
  if (isDemoMode()) return createLocalRepo<ScheduledVisit>('visit-calendar.demo.schedules');
  return createFirebaseRepo<ScheduledVisit>('confirmed_schedules') ?? createLocalRepo<ScheduledVisit>('visit-calendar.schedules');
}

export function createUserRepo(): RealtimeRepo<UserRecord> {
  if (isDemoMode()) return createLocalRepo<UserRecord>('visit-calendar.demo.users');
  return createFirebaseRepo<UserRecord>('users') ?? createLocalRepo<UserRecord>('visit-calendar.users');
}

export function createUserArchiveRepo(): RealtimeRepo<UserArchiveRecord> {
  if (isDemoMode()) return createLocalRepo<UserArchiveRecord>('visit-calendar.demo.user-archive');
  return createFirebaseRepo<UserArchiveRecord>('user_archive') ?? createLocalRepo<UserArchiveRecord>('visit-calendar.user-archive');
}

export function createNurseRepo(): RealtimeRepo<Nurse> {
  if (isDemoMode()) return createLocalRepo<Nurse>('visit-calendar.demo.nurses');
  return createFirebaseRepo<Nurse>('nurses') ?? createLocalRepo<Nurse>('visit-calendar.nurses');
}

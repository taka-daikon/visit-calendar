import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { AuthUser } from '../types';
import { getFirebaseServices } from './firebaseApp';
import { DEMO_ADMIN, getDemoUserByEmail, isDemoMode } from './appEnv';

const DEMO_SESSION_KEY = 'visit-calendar.demo.auth';

function mapUser(user: User, role: 'admin' | 'nurse'): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role
  };
}

function loadDemoSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : DEMO_ADMIN;
  } catch {
    return DEMO_ADMIN;
  }
}

function saveDemoSession(user: AuthUser | null): void {
  if (!user) {
    localStorage.removeItem(DEMO_SESSION_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: DEMO_SESSION_KEY }));
    return;
  }
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(user));
  window.dispatchEvent(new StorageEvent('storage', { key: DEMO_SESSION_KEY }));
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  if (isDemoMode()) {
    const user = getDemoUserByEmail(email || (password === 'nurse' ? 'demo-nurse@example.com' : 'demo-admin@example.com'));
    saveDemoSession(user);
    return user;
  }

  const services = getFirebaseServices();
  if (!services) {
    return { uid: 'local-admin', email, displayName: 'ローカル管理者', role: 'admin' };
  }
  const credential = await signInWithEmailAndPassword(services.auth, email, password);
  const roleDoc = await getDoc(doc(services.db, 'roles', credential.user.uid));
  const role = (roleDoc.data()?.role as 'admin' | 'nurse' | undefined) ?? 'nurse';
  return mapUser(credential.user, role);
}

export async function signOutUser(): Promise<void> {
  if (isDemoMode()) {
    saveDemoSession(null);
    return;
  }
  const services = getFirebaseServices();
  if (!services) return;
  await signOut(services.auth);
}

export function subscribeAuth(callback: (user: AuthUser | null) => void): () => void {
  if (isDemoMode()) {
    const handler = () => callback(loadDemoSession());
    window.addEventListener('storage', handler);
    handler();
    return () => window.removeEventListener('storage', handler);
  }

  const services = getFirebaseServices();
  if (!services) {
    callback({ uid: 'local-admin', email: 'local@example.com', displayName: 'ローカル管理者', role: 'admin' });
    return () => undefined;
  }
  return onAuthStateChanged(services.auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    const roleDoc = await getDoc(doc(services.db, 'roles', user.uid));
    const role = (roleDoc.data()?.role as 'admin' | 'nurse' | undefined) ?? 'nurse';
    callback(mapUser(user, role));
  });
}

import { AuthUser, SyncProvider } from '../types';

export const DEMO_ADMIN: AuthUser = {
  uid: 'demo-admin',
  email: 'demo-admin@example.com',
  displayName: 'デモ管理者',
  role: 'admin'
};

export const DEMO_NURSE: AuthUser = {
  uid: 'demo-nurse',
  email: 'demo-nurse@example.com',
  displayName: 'デモ看護師',
  role: 'nurse'
};

export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true' || import.meta.env.VITE_SYNC_PROVIDER === 'demo';
}

export function currentSyncProvider(): SyncProvider {
  if (isDemoMode()) return 'demo';
  return import.meta.env.VITE_SYNC_PROVIDER === 'firebase' ? 'firebase' : 'local';
}

export function getDemoUserByEmail(email: string): AuthUser {
  return email.includes('nurse') ? DEMO_NURSE : DEMO_ADMIN;
}

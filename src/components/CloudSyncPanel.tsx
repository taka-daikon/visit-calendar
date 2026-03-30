import { AuthUser, SyncState } from '../types';

interface Props {
  authUser: AuthUser | null;
  syncState: SyncState;
  email: string;
  password: string;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function CloudSyncPanel({ authUser, syncState, email, password, onChangeEmail, onChangePassword, onSignIn, onSignOut }: Props) {
  return (
    <section className="card panel">
      <h2>Firebase 完全運用版</h2>
      <p>同期方式: <strong>{syncState.provider}</strong> / 状態: <strong>{syncState.connected ? '接続中' : 'ローカル'}</strong></p>
      {syncState.provider === 'demo' && <p className="warning-text">デモモードです。ダミーキーのままでも確認でき、 demo-admin@example.com または demo-nurse@example.com でログインできます。</p>}
      {syncState.error && <p className="danger-text">{syncState.error}</p>}
      {authUser ? (
        <div className="mini-card">
          <div>{authUser.displayName ?? authUser.email}</div>
          <div>権限: {authUser.role}</div>
          <button onClick={onSignOut}>サインアウト</button>
        </div>
      ) : (
        <div className="field-grid">
          <label>メール<input value={email} onChange={(e) => onChangeEmail(e.target.value)} placeholder="demo-admin@example.com" /></label>
          <label>パスワード<input type="password" value={password} onChange={(e) => onChangePassword(e.target.value)} placeholder="任意（デモ時は自由）" /></label>
          <button className="primary" onClick={onSignIn}>サインイン</button>
        </div>
      )}
      <small>Firestore ルールで admin / nurse を分離し、confirmed_schedules・users・nurses をリアルタイム同期します。デモモードでは localStorage ベースで疑似同期します。</small>
    </section>
  );
}

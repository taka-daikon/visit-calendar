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
      <h2>アカウント / 同期状態</h2>
      <p>同期方式: <strong>{syncState.provider}</strong> / 状態: <strong>{syncState.connected ? '接続中' : '未接続'}</strong></p>
      {syncState.provider === 'demo' && <p className="warning-text">現在はデモモードです。本番運用では Firebase 接続と実アカウントを使用してください。</p>}
      {syncState.error && <p className="danger-text">{syncState.error}</p>}
      {authUser ? (
        <div className="mini-card">
          <div>{authUser.displayName ?? authUser.email}</div>
          <div>権限: {authUser.role}</div>
          <button onClick={onSignOut}>サインアウト</button>
        </div>
      ) : (
        <div className="field-grid">
          <label>メール<input value={email} onChange={(e) => onChangeEmail(e.target.value)} placeholder="admin@example.com" /></label>
          <label>パスワード<input type="password" value={password} onChange={(e) => onChangePassword(e.target.value)} placeholder="パスワードを入力" /></label>
          <button className="primary" onClick={onSignIn}>サインイン</button>
        </div>
      )}
      <small>ログイン後に、利用者・看護師・確定スケジュールを Firebase 上で管理します。</small>
    </section>
  );
}

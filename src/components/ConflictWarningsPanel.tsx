import { ConflictWarning } from '../types';

export function ConflictWarningsPanel({ warnings }: { warnings: ConflictWarning[] }) {
  return (
    <section className="card panel">
      <h2>重複警告</h2>
      {warnings.length === 0 ? <p className="empty">重複は検出されていません。</p> : (
        <ul className="warning-list">
          {warnings.map((warning, index) => <li key={`${warning.dateKey}-${index}`}>{warning.message}</li>)}
        </ul>
      )}
    </section>
  );
}

import { DocumentDeadline } from '../types';

export function DocumentsDashboard({ items }: { items: DocumentDeadline[] }) {
  return (
    <section className="card panel">
      <h2>介護 / 医療 書類期限ダッシュボード</h2>
      <div className="compact-list">
        {items.slice(0, 8).map((item) => (
          <article key={item.userId} className={`mini-card ${item.daysRemaining < 0 ? 'danger' : item.daysRemaining <= 14 ? 'warning' : ''}`}>
            <strong>{item.userName}</strong>
            <div>{item.kind} / {item.area}</div>
            <div>期限: {item.dueDate}（{item.daysRemaining}日）</div>
          </article>
        ))}
      </div>
    </section>
  );
}

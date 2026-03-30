import { ReviewAlert } from '../types';

export function AlertsPanel({ alerts }: { alerts: ReviewAlert[] }) {
  return (
    <section className="card panel">
      <h2>更新サイクル期限アラート</h2>
      <div className="compact-list">
        {alerts.slice(0, 8).map((alert) => (
          <article key={alert.userId} className={`mini-card status-${alert.status}`}>
            <strong>{alert.userName}</strong>
            <div>{alert.area} / {alert.insuranceType} / {alert.updateCycle}</div>
            <div>期限: {alert.dueDate} {alert.status === 'needs-base-date' ? '(基準日未登録)' : `(${alert.daysRemaining}日)`}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

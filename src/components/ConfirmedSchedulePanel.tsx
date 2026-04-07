import { Nurse, ScheduledVisit } from '../types';

interface Props {
  visits: ScheduledVisit[];
  nurses: Nurse[];
  duplicateUserIds: string[];
  duplicateUserTooltips: Record<string, string[]>;
  onUpdate: (visit: ScheduledVisit) => void;
  onRemove: (slotId: string) => void;
}

export function ConfirmedSchedulePanel({ visits, nurses, duplicateUserIds, duplicateUserTooltips, onUpdate, onRemove }: Props) {
  const duplicateIdSet = new Set(duplicateUserIds);
  const renderDuplicateBadge = (userId: string) => {
    const labels = duplicateUserTooltips[userId] ?? [];
    if (!labels.length) return null;
    return (
      <span className="duplicate-warning-badge" role="note" tabIndex={0}>
        ⚠ 重複
        <span className="duplicate-warning-tooltip">
          {labels.map((label) => (
            <span key={`${userId}-${label}`} className="duplicate-warning-tooltip-line">{label}</span>
          ))}
        </span>
      </span>
    );
  };
  return (
    <section className="card panel">
      <h2>確定スケジュール ({visits.length})</h2>
      <div className="compact-list scrollable-list">
        {visits.length === 0 && <p className="empty">確定訪問はまだありません。</p>}
        {visits.map((visit) => (
          <article key={visit.slotId} className={`mini-card confirmed-panel-card ${duplicateIdSet.has(visit.userId) ? 'duplicate-user-box' : ''}`} style={{ borderLeft: `8px solid ${visit.boxColor || '#34d399'}` }}>
            <div className="split-line">
              <div>
                <strong>{visit.userName}</strong>
                {renderDuplicateBadge(visit.userId)}
                <div className="card-subtext">{visit.address || visit.area}</div>
                {visit.preferredNurseName && <div className="card-subtext">担当希望: {visit.preferredNurseName}</div>}
              </div>
              <button onClick={() => onRemove(visit.slotId)}>差し戻し</button>
            </div>
            <div>{visit.dateKey} [{visit.start}-{visit.end}] / {visit.area}</div>
            <div>{visit.treatment}</div>
            <label>
              担当看護師
              <select value={visit.nurseId ?? ''} onChange={(e) => {
                const nurse = nurses.find((item) => item.id === e.target.value);
                onUpdate({ ...visit, nurseId: nurse?.id, nurseName: nurse?.name, manuallyEdited: true });
              }}>
                <option value="">未割当</option>
                {nurses.map((nurse) => <option key={nurse.id} value={nurse.id}>{nurse.name}</option>)}
              </select>
            </label>
            <label>
              メモ
              <input value={visit.memo ?? ''} onChange={(e) => onUpdate({ ...visit, memo: e.target.value, manuallyEdited: true })} />
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}

import { CandidateVisit } from '../types';

interface Props {
  visits: CandidateVisit[];
  areaColors: Record<string, string>;
  onDragStart: (slotId: string) => void;
  duplicateUserIds: string[];
  duplicateUserTooltips: Record<string, string[]>;
}

export function CandidateList({ visits, areaColors, onDragStart, duplicateUserIds, duplicateUserTooltips }: Props) {
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
      <h2>未割当候補 ({visits.length})</h2>
      <div className="compact-list scrollable-list">
        {visits.length === 0 && <p className="empty">未割当候補はありません。</p>}
        {visits.map((visit) => (
          <article
            key={visit.slotId}
            className={`visit-card ${duplicateIdSet.has(visit.userId) ? 'duplicate-user-box' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', `candidate:${visit.slotId}`);
              onDragStart(visit.slotId);
            }}
            style={{ borderLeftColor: visit.boxColor || areaColors[visit.area] || '#cbd5e1' }}
          >
            <div className="split-line">
              <div>
                <strong>{visit.userName}</strong>
                {renderDuplicateBadge(visit.userId)}
                <div className="card-subtext">{visit.address || visit.area}</div>
                {visit.preferredNurseName && <div className="card-subtext">担当看護師: {visit.preferredNurseName}</div>}
              </div>
              <span className="badge" style={{ background: visit.boxColor || areaColors[visit.area] || '#eef2ff' }}>{visit.area}</span>
            </div>
            <div>{visit.dateKey} / 時間: {visit.start} - {visit.end}</div>
            <div>{visit.insuranceType} / {visit.treatment}</div>
            <div>希望性別: {visit.genderPreference}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

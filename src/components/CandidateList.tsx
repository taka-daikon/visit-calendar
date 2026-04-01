import { CandidateVisit } from '../types';

interface Props {
  visits: CandidateVisit[];
  areaColors: Record<string, string>;
  onDragStart: (slotId: string) => void;
}

export function CandidateList({ visits, areaColors, onDragStart }: Props) {
  return (
    <section className="card panel">
      <h2>未割当候補 ({visits.length})</h2>
      <div className="compact-list scrollable-list">
        {visits.length === 0 && <p className="empty">未割当候補はありません。</p>}
        {visits.map((visit) => (
          <article
            key={visit.slotId}
            className="visit-card"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', visit.slotId);
              onDragStart(visit.slotId);
            }}
            style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}
          >
            <div className="split-line">
              <div>
                <strong>{visit.userName}</strong>
                <div className="card-subtext">{visit.area}</div>
              </div>
              <span className="badge" style={{ background: areaColors[visit.area] ?? '#eef2ff' }}>{visit.area}</span>
            </div>
            <div>{visit.dateKey} [{visit.start}-{visit.end}]</div>
            <div>{visit.insuranceType} / {visit.treatment}</div>
            <div>希望性別: {visit.genderPreference}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

import { CandidateVisit } from '../types';

interface Props {
  visits: CandidateVisit[];
  areaColors: Record<string, string>;
  onDragStart: (slotId: string) => void;
}

export function CandidateList({ visits, areaColors, onDragStart }: Props) {
  return (
    <section className="card panel">
      <h2>訪問候補 ({visits.length})</h2>
      <div className="compact-list scrollable-list">
        {visits.length === 0 && <p className="empty">候補がありません。</p>}
        {visits.map((visit) => (
          <article key={visit.slotId} className="visit-card" draggable onDragStart={() => onDragStart(visit.slotId)} style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}>
            <div className="split-line">
              <strong>{visit.userName}</strong>
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

import { Nurse, ScheduledVisit } from '../types';

interface Props {
  visits: ScheduledVisit[];
  nurses: Nurse[];
  onUpdate: (visit: ScheduledVisit) => void;
  onRemove: (slotId: string) => void;
}

export function ConfirmedSchedulePanel({ visits, nurses, onUpdate, onRemove }: Props) {
  return (
    <section className="card panel">
      <h2>確定スケジュール ({visits.length})</h2>
      <div className="compact-list scrollable-list">
        {visits.length === 0 && <p className="empty">確定訪問はまだありません。</p>}
        {visits.map((visit) => (
          <article key={visit.slotId} className="mini-card">
            <div className="split-line">
              <div>
                <strong>{visit.userName}</strong>
                <div className="card-subtext">{visit.area}</div>
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

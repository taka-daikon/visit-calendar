import { CalendarDay, CandidateVisit, ScheduledVisit, ViewMode } from '../types';

interface WorkerAvailabilityItem {
  nurseId: string;
  nurseName: string;
  label: string;
}

interface Props {
  days: CalendarDay[];
  candidatesByDate: Record<string, CandidateVisit[]>;
  scheduledByDate: Record<string, ScheduledVisit[]>;
  workerAvailabilityByDate: Record<string, WorkerAvailabilityItem[]>;
  areaColors: Record<string, string>;
  onDragStart: (slotId: string) => void;
  onDropCandidate: (dateKey: string, slotId?: string) => void;
  onConfirmCandidate: (slotId: string) => void;
  onRemoveCandidate: (slotId: string) => void;
  onRemoveScheduled: (slotId: string) => void;
  viewMode: ViewMode;
}

export function CalendarView({
  days,
  candidatesByDate,
  scheduledByDate,
  workerAvailabilityByDate,
  areaColors,
  onDragStart,
  onDropCandidate,
  onConfirmCandidate,
  onRemoveCandidate,
  onRemoveScheduled,
  viewMode
}: Props) {
  const className = viewMode === 'month' ? 'calendar-grid month-grid' : viewMode === 'week' ? 'calendar-grid week-grid' : 'calendar-grid day-grid';

  return (
    <section className="card panel">
      <h2>カレンダービュー</h2>
      <div className={className}>
        {days.map((day) => {
          const dayCandidates = candidatesByDate[day.dateKey] ?? [];
          const dayScheduled = scheduledByDate[day.dateKey] ?? [];
          const dayWorkers = workerAvailabilityByDate[day.dateKey] ?? [];
          const scheduledGroups = dayScheduled.reduce<Record<string, ScheduledVisit[]>>((acc, visit) => {
            const key = visit.nurseName || '未割当';
            acc[key] ??= [];
            acc[key].push(visit);
            return acc;
          }, {});
          const cellColor = day.weekdayIndex === 6 ? '#E6F0FF' : day.weekdayIndex === 0 ? '#FFE6E6' : '#FFFFFF';

          return (
            <article
              key={day.dateKey}
              className={`calendar-cell ${day.inMonth ? '' : 'muted'}`}
              style={{ background: cellColor }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const slotId = e.dataTransfer.getData('text/plain');
                onDropCandidate(day.dateKey, slotId || undefined);
              }}
            >
              <header className="split-line"><strong>{day.date.getDate()}日</strong><span>{dayScheduled.length}件確定</span></header>

              <div className="calendar-section">
                <div className="section-title">看護師予定</div>
                {dayWorkers.length === 0 && <div className="empty small">予定なし</div>}
                {dayWorkers.map((worker) => (
                  <div key={`${day.dateKey}-${worker.nurseId}-${worker.label}`} className="calendar-item worker-slot worker-readonly">
                    <span><strong>{worker.nurseName}</strong> {worker.label}</span>
                  </div>
                ))}
              </div>

              <div className="calendar-section">
                <div className="section-title">未割当候補</div>
                {dayCandidates.length === 0 && <div className="empty small">候補なし</div>}
                {dayCandidates.map((visit) => (
                  <div
                    key={visit.slotId}
                    className="calendar-item candidate removable"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', visit.slotId);
                      onDragStart(visit.slotId);
                    }}
                    style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}
                  >
                    <div className="calendar-item-body">
                      <div className="calendar-item-title">[{visit.start}-{visit.end}] {visit.userName}</div>
                      <div className="calendar-item-sub">{visit.area}</div>
                    </div>
                    <div className="hover-actions">
                      <button className="hover-confirm" onClick={() => onConfirmCandidate(visit.slotId)}>○</button>
                      <button className="hover-remove" onClick={() => onRemoveCandidate(visit.slotId)}>×</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="calendar-section confirmed-zone">
                <div className="section-title">確定</div>
                {Object.keys(scheduledGroups).length === 0 && <div className="empty small">確定なし</div>}
                {Object.entries(scheduledGroups).map(([nurseName, visits]) => (
                  <div key={`${day.dateKey}-${nurseName}`} className="confirmed-group">
                    <div className="confirmed-group-title">{nurseName}</div>
                    {visits.map((visit) => (
                      <div key={visit.slotId} className="calendar-item confirmed confirmed-bright" style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}>
                        <div className="calendar-item-body">
                          <div className="calendar-item-title">【確定】[{visit.start}-{visit.end}] {visit.userName}</div>
                          <div className="calendar-item-sub">{visit.area}</div>
                        </div>
                        <button onClick={() => onRemoveScheduled(visit.slotId)}>×</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

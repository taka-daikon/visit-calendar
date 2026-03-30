import { CalendarDay, CandidateVisit, ScheduledVisit, ViewMode } from '../types';

interface Props {
  days: CalendarDay[];
  candidatesByDate: Record<string, CandidateVisit[]>;
  scheduledByDate: Record<string, ScheduledVisit[]>;
  areaColors: Record<string, string>;
  onDragStart: (slotId: string) => void;
  onDropVisit: (dateKey: string) => void;
  onRemoveScheduled: (slotId: string) => void;
  viewMode: ViewMode;
}

export function CalendarView({ days, candidatesByDate, scheduledByDate, areaColors, onDragStart, onDropVisit, onRemoveScheduled, viewMode }: Props) {
  const className = viewMode === 'month' ? 'calendar-grid month-grid' : viewMode === 'week' ? 'calendar-grid week-grid' : 'calendar-grid day-grid';
  return (
    <section className="card panel">
      <h2>カレンダービュー</h2>
      <div className={className}>
        {days.map((day) => {
          const dayCandidates = candidatesByDate[day.dateKey] ?? [];
          const dayScheduled = scheduledByDate[day.dateKey] ?? [];
          const cellColor = day.weekdayIndex === 6 ? '#E6F0FF' : day.weekdayIndex === 0 ? '#FFE6E6' : '#FFFFFF';
          return (
            <article
              key={day.dateKey}
              className={`calendar-cell ${day.inMonth ? '' : 'muted'}`}
              style={{ background: cellColor }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropVisit(day.dateKey)}
            >
              <header className="split-line"><strong>{day.date.getDate()}日</strong><span>{dayScheduled.length}件確定</span></header>
              <div className="calendar-section">
                <div className="section-title">候補</div>
                {dayCandidates.slice(0, 5).map((visit) => (
                  <div key={visit.slotId} className="calendar-item candidate" draggable onDragStart={() => onDragStart(visit.slotId)} style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}>
                    [{visit.start}-{visit.end}] {visit.userName}
                  </div>
                ))}
              </div>
              <div className="calendar-section confirmed-zone">
                <div className="section-title">確定</div>
                {dayScheduled.map((visit) => (
                  <div key={visit.slotId} className="calendar-item confirmed" style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}>
                    <span>[{visit.start}-{visit.end}] {visit.userName} {visit.nurseName ? `(${visit.nurseName})` : ''}</span>
                    <button onClick={() => onRemoveScheduled(visit.slotId)}>×</button>
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

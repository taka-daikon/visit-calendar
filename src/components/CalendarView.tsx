import { useState } from 'react';
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
  onUpdateCandidateTime: (slotId: string, start: string, end: string) => void;
  onUpdateScheduledTime: (slotId: string, start: string, end: string) => void;
  viewMode: ViewMode;
  periodLabel: string;
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
  onUpdateCandidateTime,
  onUpdateScheduledTime,
  viewMode,
  periodLabel
}: Props) {
  const className = viewMode === 'month' ? 'calendar-grid month-grid' : viewMode === 'week' ? 'calendar-grid week-grid' : 'calendar-grid day-grid';
  const [editingCandidateId, setEditingCandidateId] = useState('');
  const [editingScheduledId, setEditingScheduledId] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  const beginCandidateEdit = (visit: CandidateVisit) => {
    setEditingScheduledId('');
    setEditingCandidateId(visit.slotId);
    setEditStart(visit.start);
    setEditEnd(visit.end);
  };

  const beginScheduledEdit = (visit: ScheduledVisit) => {
    setEditingCandidateId('');
    setEditingScheduledId(visit.slotId);
    setEditStart(visit.start);
    setEditEnd(visit.end);
  };

  const cancelEdit = () => {
    setEditingCandidateId('');
    setEditingScheduledId('');
    setEditStart('');
    setEditEnd('');
  };

  const saveCandidateEdit = () => {
    if (!editingCandidateId) return;
    onUpdateCandidateTime(editingCandidateId, editStart, editEnd);
    cancelEdit();
  };

  const saveScheduledEdit = () => {
    if (!editingScheduledId) return;
    onUpdateScheduledTime(editingScheduledId, editStart, editEnd);
    cancelEdit();
  };

  return (
    <section className="card panel">
      <header className="calendar-panel-header">
        <div>
          <h2>カレンダービュー</h2>
          <p className="helper-text">〇で確定、×で削除、時計ボタンで時間微修正。確定済みは濃い色で表示し、下の「確定」欄へ移動します。</p>
        </div>
        <div className="calendar-period-chip">【{periodLabel}】</div>
      </header>
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
                {dayCandidates.map((visit) => {
                  const isEditing = editingCandidateId === visit.slotId;
                  return (
                    <div
                      key={visit.slotId}
                      className={`calendar-item candidate removable ${isEditing ? 'editing-card' : ''}`}
                      draggable={!isEditing}
                      onDragStart={(e) => {
                        if (isEditing) return;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', visit.slotId);
                        onDragStart(visit.slotId);
                      }}
                      style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}
                    >
                      <div className="calendar-item-body">
                        <div className="calendar-item-title">[{visit.start}-{visit.end}] {visit.userName}</div>
                        <div className="calendar-item-sub">{visit.address || visit.area}</div>
                        <div className="calendar-item-meta">担当エリア: {visit.area}</div>
                        {isEditing && (
                          <div className="time-edit-panel">
                            <div className="time-edit-row">
                              <label>
                                開始
                                <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                              </label>
                              <label>
                                終了
                                <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                              </label>
                            </div>
                            <div className="time-edit-actions">
                              <button className="small-action primary-soft" onClick={saveCandidateEdit}>保存</button>
                              <button className="small-action" onClick={cancelEdit}>戻る</button>
                            </div>
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="hover-actions">
                          <button className="hover-confirm" onClick={() => onConfirmCandidate(visit.slotId)} aria-label="確定">○</button>
                          <button className="hover-edit" onClick={() => beginCandidateEdit(visit)} aria-label="時間修正">🕒</button>
                          <button className="hover-remove" onClick={() => onRemoveCandidate(visit.slotId)} aria-label="削除">×</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="calendar-section confirmed-zone">
                <div className="section-title">確定</div>
                {Object.keys(scheduledGroups).length === 0 && <div className="empty small">確定なし</div>}
                {Object.entries(scheduledGroups).map(([nurseName, visits]) => (
                  <div key={`${day.dateKey}-${nurseName}`} className="confirmed-group">
                    <div className="confirmed-group-title">{nurseName}</div>
                    {visits.map((visit) => {
                      const isEditing = editingScheduledId === visit.slotId;
                      return (
                        <div key={visit.slotId} className={`calendar-item confirmed confirmed-fixed ${isEditing ? 'editing-card' : ''}`} style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}>
                          <div className="calendar-item-body">
                            <div className="calendar-item-title">【確定】[{visit.start}-{visit.end}] {visit.userName}</div>
                            <div className="calendar-item-sub">{visit.address || visit.area}</div>
                            <div className="calendar-item-meta">担当エリア: {visit.area}</div>
                            {isEditing && (
                              <div className="time-edit-panel dark-panel">
                                <div className="time-edit-row">
                                  <label>
                                    開始
                                    <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                                  </label>
                                  <label>
                                    終了
                                    <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                                  </label>
                                </div>
                                <div className="time-edit-actions">
                                  <button className="small-action light-action" onClick={saveScheduledEdit}>保存</button>
                                  <button className="small-action light-action" onClick={cancelEdit}>戻る</button>
                                </div>
                              </div>
                            )}
                          </div>
                          {!isEditing && (
                            <div className="confirmed-actions">
                              <button className="confirmed-edit" onClick={() => beginScheduledEdit(visit)} aria-label="時間修正">🕒</button>
                              <button className="confirmed-remove" onClick={() => onRemoveScheduled(visit.slotId)} aria-label="差し戻し">×</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
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

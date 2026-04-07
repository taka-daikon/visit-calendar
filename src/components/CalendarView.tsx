import { useMemo, useState } from 'react';
import { CalendarDay, CandidateVisit, ScheduledVisit, ViewMode } from '../types';

interface WorkerAvailabilityItem {
  shiftId: string;
  nurseId: string;
  nurseName: string;
  dateKey: string;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  fixed: boolean;
  label: string;
}

interface Props {
  days: CalendarDay[];
  candidatesByDate: Record<string, CandidateVisit[]>;
  scheduledByDate: Record<string, ScheduledVisit[]>;
  workerAvailabilityByDate: Record<string, WorkerAvailabilityItem[]>;
  areaColors: Record<string, string>;
  onDragStart: (slotId: string) => void;
  onDragStartWorkerShift: (shiftId: string) => void;
  onDropCandidate: (dateKey: string, slotId?: string) => void;
  onDropWorkerShift: (dateKey: string, shiftId?: string) => void;
  onConfirmCandidate: (slotId: string) => void;
  onRemoveCandidate: (slotId: string) => void;
  onRemoveScheduled: (slotId: string) => void;
  onConfirmWorkerShift: (shiftId: string) => void;
  onRemoveWorkerShift: (shiftId: string) => void;
  onUpdateCandidateTime: (slotId: string, start: string, end: string) => void;
  onUpdateScheduledTime: (slotId: string, start: string, end: string) => void;
  onUpdateWorkerShiftTime: (shiftId: string, start: string, end: string) => void;
  onCreateUserFromDate: (dateKey: string) => void;
  onOpenUserEditor: (userId: string) => void;
  onOpenNurseEditor: (nurseId: string, dateKey: string, shiftId: string) => void;
  viewMode: ViewMode;
  periodLabel: string;
  selectedNurseName: string;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function groupVisitsByAddress<T extends CandidateVisit | ScheduledVisit>(visits: T[]): Array<{ address: string; visits: T[] }> {
  const grouped = visits.reduce<Record<string, T[]>>((acc, visit) => {
    const key = (visit.address || visit.area || '住所未設定').trim();
    acc[key] ??= [];
    acc[key].push(visit);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([address, items]) => ({
      address,
      visits: [...items].sort((a, b) => Number(Boolean(b.preferredNurseName)) - Number(Boolean(a.preferredNurseName)) || a.startMinutes - b.startMinutes || a.userName.localeCompare(b.userName, 'ja'))
    }))
    .sort((a, b) => a.address.localeCompare(b.address, 'ja'));
}

function accentStyle(color?: string) {
  const accent = color || '#cbd5e1';
  return {
    borderLeftColor: accent,
    boxShadow: `inset 0 0 0 1px ${accent}33`
  };
}

export function CalendarView({
  days,
  candidatesByDate,
  scheduledByDate,
  workerAvailabilityByDate,
  areaColors,
  onDragStart,
  onDragStartWorkerShift,
  onDropCandidate,
  onDropWorkerShift,
  onConfirmCandidate,
  onRemoveCandidate,
  onRemoveScheduled,
  onConfirmWorkerShift,
  onRemoveWorkerShift,
  onUpdateCandidateTime,
  onUpdateScheduledTime,
  onUpdateWorkerShiftTime,
  onCreateUserFromDate,
  onOpenUserEditor,
  onOpenNurseEditor,
  viewMode,
  periodLabel,
  selectedNurseName
}: Props) {
  const className = viewMode === 'month' ? 'calendar-grid month-grid' : viewMode === 'week' ? 'calendar-grid week-grid' : 'calendar-grid day-grid';
  const [editingCandidateId, setEditingCandidateId] = useState('');
  const [editingScheduledId, setEditingScheduledId] = useState('');
  const [editingWorkerId, setEditingWorkerId] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  const candidateGroupsByDate = useMemo(() => Object.fromEntries(
    Object.entries(candidatesByDate).map(([dateKey, visits]) => [dateKey, groupVisitsByAddress(visits)])
  ) as Record<string, Array<{ address: string; visits: CandidateVisit[] }>>, [candidatesByDate]);

  const scheduledGroupsByDate = useMemo(() => Object.fromEntries(
    Object.entries(scheduledByDate).map(([dateKey, visits]) => [dateKey, groupVisitsByAddress(visits)])
  ) as Record<string, Array<{ address: string; visits: ScheduledVisit[] }>>, [scheduledByDate]);

  const beginCandidateEdit = (visit: CandidateVisit) => {
    setEditingWorkerId('');
    setEditingScheduledId('');
    setEditingCandidateId(visit.slotId);
    setEditStart(visit.start);
    setEditEnd(visit.end);
  };

  const beginScheduledEdit = (visit: ScheduledVisit) => {
    setEditingWorkerId('');
    setEditingCandidateId('');
    setEditingScheduledId(visit.slotId);
    setEditStart(visit.start);
    setEditEnd(visit.end);
  };

  const beginWorkerEdit = (shift: WorkerAvailabilityItem) => {
    setEditingCandidateId('');
    setEditingScheduledId('');
    setEditingWorkerId(shift.shiftId);
    setEditStart(shift.start);
    setEditEnd(shift.end);
  };

  const cancelEdit = () => {
    setEditingCandidateId('');
    setEditingScheduledId('');
    setEditingWorkerId('');
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

  const saveWorkerEdit = () => {
    if (!editingWorkerId) return;
    onUpdateWorkerShiftTime(editingWorkerId, editStart, editEnd);
    cancelEdit();
  };

  return (
    <section className="card panel calendar-board-panel">
      <header className="calendar-panel-header whiteboard-header">
        <div>
          <h2>ホワイトボードスケジュール</h2>
          <p className="helper-text">空きセルをクリックすると新規利用者登録、利用者BOXをクリックすると利用者編集、看護師BOXをクリックすると看護師編集ができます。表示中: {selectedNurseName}</p>
        </div>
        <div className="calendar-header-right">
          <div className="calendar-period-chip">{periodLabel}</div>
          <div className="calendar-legend">
            <span className="legend-chip legend-worker">看護師</span>
            <span className="legend-chip legend-candidate">未割当</span>
            <span className="legend-chip legend-fixed">FIX</span>
          </div>
        </div>
      </header>

      <div className={className}>
        {days.map((day) => {
          const dayCandidates = candidateGroupsByDate[day.dateKey] ?? [];
          const dayScheduledGroups = scheduledGroupsByDate[day.dateKey] ?? [];
          const dayScheduledCount = scheduledByDate[day.dateKey]?.length ?? 0;
          const dayWorkers = workerAvailabilityByDate[day.dateKey] ?? [];
          const cellTone = day.weekdayIndex === 6 ? 'tone-sat' : day.weekdayIndex === 0 ? 'tone-sun' : 'tone-weekday';

          return (
            <article
              key={day.dateKey}
              className={`calendar-cell whiteboard-cell ${cellTone} ${day.inMonth ? '' : 'muted'}`}
              onClick={() => onCreateUserFromDate(day.dateKey)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const payload = e.dataTransfer.getData('text/plain');
                if (payload.startsWith('worker:')) {
                  onDropWorkerShift(day.dateKey, payload.replace(/^worker:/, ''));
                  return;
                }
                if (payload.startsWith('candidate:')) {
                  onDropCandidate(day.dateKey, payload.replace(/^candidate:/, ''));
                  return;
                }
                onDropCandidate(day.dateKey, payload || undefined);
              }}
            >
              <header className="calendar-cell-header">
                <div>
                  <strong>{day.date.getDate()}日 ({WEEKDAY_LABELS[day.weekdayIndex]})</strong>
                  <div className="calendar-cell-date">{day.dateKey}</div>
                </div>
                <span className="day-fixed-chip">FIX {dayScheduledCount}</span>
              </header>

              <div className="calendar-section worker-section">
                <div className="section-title">看護師シフト</div>
                {dayWorkers.length === 0 && <div className="empty small">シフトなし</div>}
                {dayWorkers.map((shift) => {
                  const isEditing = editingWorkerId === shift.shiftId;
                  return (
                    <div
                      key={shift.shiftId}
                      className={`calendar-item worker-slot removable magnet-card ${shift.fixed ? 'worker-fixed' : ''} ${isEditing ? 'editing-card' : ''}`}
                      draggable={!isEditing}
                      style={accentStyle('#60a5fa')}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenNurseEditor(shift.nurseId, shift.dateKey, shift.shiftId);
                      }}
                      onDragStart={(e) => {
                        if (isEditing) return;
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', `worker:${shift.shiftId}`);
                        onDragStartWorkerShift(shift.shiftId);
                      }}
                    >
                      <div className="calendar-item-body">
                        <div className="calendar-item-title">[{shift.start}-{shift.end}] {shift.nurseName}</div>
                        <div className="calendar-item-sub">看護師BOXをクリックすると勤務情報を編集できます</div>
                        <div className="calendar-item-meta">{shift.fixed ? 'FIX済み' : '未FIX'}</div>
                        {isEditing && (
                          <div className={`time-edit-panel ${shift.fixed ? 'dark-panel' : ''}`} onClick={(event) => event.stopPropagation()}>
                            <div className="time-edit-current">現在: {shift.start} - {shift.end}</div>
                            <div className="time-edit-row">
                              <label>
                                開始
                                <input type="time" step={600} value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                              </label>
                              <label>
                                終了
                                <input type="time" step={600} value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                              </label>
                            </div>
                            <div className="time-edit-actions">
                              <button className={`small-action ${shift.fixed ? 'light-action' : 'primary-soft'}`} onClick={saveWorkerEdit}>保存</button>
                              <button className={`small-action ${shift.fixed ? 'light-action' : ''}`} onClick={cancelEdit}>戻る</button>
                            </div>
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="hover-actions visible-actions" onClick={(event) => event.stopPropagation()}>
                          <button className="hover-confirm" onClick={() => onConfirmWorkerShift(shift.shiftId)} aria-label="シフト確定">○</button>
                          <button className="hover-edit" onClick={() => beginWorkerEdit(shift)} aria-label="シフト時間修正">🕒</button>
                          <button className="hover-remove" onClick={() => onRemoveWorkerShift(shift.shiftId)} aria-label="シフト削除">×</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="calendar-section candidate-section">
                <div className="section-title">未割当候補</div>
                {dayCandidates.length === 0 && <div className="empty small">候補なし</div>}
                {dayCandidates.map((group) => (
                  <div key={`${day.dateKey}-${group.address}`} className="address-group-card candidate-group-card" onClick={(event) => event.stopPropagation()}>
                    <div className="address-group-header">
                      <strong>{group.address}</strong>
                      <span>{group.visits.length}件</span>
                    </div>
                    <div className="address-group-list">
                      {group.visits.map((visit) => {
                        const isEditing = editingCandidateId === visit.slotId;
                        const accent = visit.boxColor || areaColors[visit.area] || '#cbd5e1';
                        return (
                          <div
                            key={visit.slotId}
                            className={`calendar-item candidate removable magnet-card ${isEditing ? 'editing-card' : ''}`}
                            draggable={!isEditing}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenUserEditor(visit.userId);
                            }}
                            onDragStart={(e) => {
                              if (isEditing) return;
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', `candidate:${visit.slotId}`);
                              onDragStart(visit.slotId);
                            }}
                            style={accentStyle(accent)}
                          >
                            <div className="calendar-item-body">
                              <div className="calendar-item-title">[{visit.start}-{visit.end}] {visit.userName}</div>
                              <div className="calendar-item-sub">{visit.address || visit.area}</div>
                              <div className="calendar-item-meta">担当希望: {visit.preferredNurseName || '未指定'} / エリア: {visit.area}</div>
                              {isEditing && (
                                <div className="time-edit-panel" onClick={(event) => event.stopPropagation()}>
                                  <div className="time-edit-current">現在: {visit.start} - {visit.end}</div>
                                  <div className="time-edit-row">
                                    <label>
                                      開始
                                      <input type="time" step={600} value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                                    </label>
                                    <label>
                                      終了
                                      <input type="time" step={600} value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
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
                              <div className="hover-actions visible-actions" onClick={(event) => event.stopPropagation()}>
                                <button className="hover-confirm" onClick={() => onConfirmCandidate(visit.slotId)} aria-label="確定">○</button>
                                <button className="hover-edit" onClick={() => beginCandidateEdit(visit)} aria-label="時間修正">🕒</button>
                                <button className="hover-remove" onClick={() => onRemoveCandidate(visit.slotId)} aria-label="削除">×</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="calendar-section confirmed-zone">
                <div className="section-title">FIX済み</div>
                {dayScheduledGroups.length === 0 && <div className="empty small">確定なし</div>}
                {dayScheduledGroups.map((group) => (
                  <div key={`${day.dateKey}-confirmed-${group.address}`} className="address-group-card confirmed-address-group" onClick={(event) => event.stopPropagation()}>
                    <div className="address-group-header confirmed-address-header">
                      <strong>{group.address}</strong>
                      <span>{group.visits.length}件FIX</span>
                    </div>
                    <div className="address-group-list">
                      {group.visits.map((visit) => {
                        const isEditing = editingScheduledId === visit.slotId;
                        const accent = visit.boxColor || areaColors[visit.area] || '#34d399';
                        return (
                          <div
                            key={visit.slotId}
                            className={`calendar-item confirmed confirmed-fixed magnet-card ${isEditing ? 'editing-card' : ''}`}
                            style={{ ...accentStyle(accent), borderLeftColor: accent }}
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenUserEditor(visit.userId);
                            }}
                          >
                            <div className="calendar-item-body">
                              <div className="calendar-item-title">【FIX】[{visit.start}-{visit.end}] {visit.userName}</div>
                              <div className="calendar-item-sub">{visit.address || visit.area}</div>
                              <div className="calendar-item-meta">担当: {visit.nurseName || visit.preferredNurseName || '未割当'} / エリア: {visit.area}</div>
                              {isEditing && (
                                <div className="time-edit-panel dark-panel" onClick={(event) => event.stopPropagation()}>
                                  <div className="time-edit-current">現在: {visit.start} - {visit.end}</div>
                                  <div className="time-edit-row">
                                    <label>
                                      開始
                                      <input type="time" step={600} value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                                    </label>
                                    <label>
                                      終了
                                      <input type="time" step={600} value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
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
                              <div className="confirmed-actions" onClick={(event) => event.stopPropagation()}>
                                <span className="fix-badge">FIX</span>
                                <button className="confirmed-edit" onClick={() => beginScheduledEdit(visit)} aria-label="時間修正">🕒</button>
                                <button className="confirmed-remove" onClick={() => onRemoveScheduled(visit.slotId)} aria-label="差し戻し">×</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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

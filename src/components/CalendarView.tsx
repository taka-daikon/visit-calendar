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
  viewMode: ViewMode;
  periodLabel: string;
  selectedNurseName: string;
}

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
      visits: [...items].sort((a, b) => a.startMinutes - b.startMinutes || a.userName.localeCompare(b.userName, 'ja'))
    }))
    .sort((a, b) => a.address.localeCompare(b.address, 'ja'));
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
    <section className="card panel">
      <header className="calendar-panel-header">
        <div>
          <h2>カレンダービュー</h2>
          <p className="helper-text">利用者も看護師も、BOX上で時間表示を明確にし、10分単位の変更・ドラッグ＆ドロップ・確定・削除に対応しました。現在のシフト表示: {selectedNurseName}</p>
        </div>
        <div className="calendar-period-chip">【{periodLabel}】</div>
      </header>
      <div className={className}>
        {days.map((day) => {
          const dayCandidates = candidateGroupsByDate[day.dateKey] ?? [];
          const dayScheduledGroups = scheduledGroupsByDate[day.dateKey] ?? [];
          const dayScheduledCount = scheduledByDate[day.dateKey]?.length ?? 0;
          const dayWorkers = workerAvailabilityByDate[day.dateKey] ?? [];
          const cellColor = day.weekdayIndex === 6 ? '#E6F0FF' : day.weekdayIndex === 0 ? '#FFE6E6' : '#FFFFFF';

          return (
            <article
              key={day.dateKey}
              className={`calendar-cell ${day.inMonth ? '' : 'muted'}`}
              style={{ background: cellColor }}
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
              <header className="split-line"><strong>{day.date.getDate()}日</strong><span>{dayScheduledCount}件確定</span></header>

              <div className="calendar-section">
                <div className="section-title">看護師シフト</div>
                {dayWorkers.length === 0 && <div className="empty small">シフトなし</div>}
                {dayWorkers.map((shift) => {
                  const isEditing = editingWorkerId === shift.shiftId;
                  return (
                    <div
                      key={shift.shiftId}
                      className={`calendar-item worker-slot removable ${shift.fixed ? 'worker-fixed' : ''} ${isEditing ? 'editing-card' : ''}`}
                      draggable={!isEditing}
                      onDragStart={(e) => {
                        if (isEditing) return;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', `worker:${shift.shiftId}`);
                        onDragStartWorkerShift(shift.shiftId);
                      }}
                    >
                      <div className="calendar-item-body">
                        <div className="calendar-item-title">[{shift.start}-{shift.end}] {shift.nurseName}</div>
                        <div className="calendar-item-sub">看護師シフトBOX {shift.fixed ? ' / FIX済み' : ''}</div>
                        <div className="calendar-item-meta">時間を直接確認しながら編集できます</div>
                        {isEditing && (
                          <div className={`time-edit-panel ${shift.fixed ? 'dark-panel' : ''}`}>
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
                        <div className="hover-actions visible-actions">
                          <button className="hover-confirm" onClick={() => onConfirmWorkerShift(shift.shiftId)} aria-label="シフト確定">○</button>
                          <button className="hover-edit" onClick={() => beginWorkerEdit(shift)} aria-label="シフト時間修正">🕒</button>
                          <button className="hover-remove" onClick={() => onRemoveWorkerShift(shift.shiftId)} aria-label="シフト削除">×</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="calendar-section">
                <div className="section-title">未割当候補</div>
                {dayCandidates.length === 0 && <div className="empty small">候補なし</div>}
                {dayCandidates.map((group) => (
                  <div key={`${day.dateKey}-${group.address}`} className="address-group-card">
                    <div className="address-group-header">
                      <strong>{group.address}</strong>
                      <span>{group.visits.length}件</span>
                    </div>
                    <div className="address-group-list">
                      {group.visits.map((visit) => {
                        const isEditing = editingCandidateId === visit.slotId;
                        return (
                          <div
                            key={visit.slotId}
                            className={`calendar-item candidate removable ${isEditing ? 'editing-card' : ''}`}
                            draggable={!isEditing}
                            onDragStart={(e) => {
                              if (isEditing) return;
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', `candidate:${visit.slotId}`);
                              onDragStart(visit.slotId);
                            }}
                            style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}
                          >
                            <div className="calendar-item-body">
                              <div className="calendar-item-title">[{visit.start}-{visit.end}] {visit.userName}</div>
                              <div className="calendar-item-sub">{visit.address || visit.area}</div>
                              <div className="calendar-item-meta">時間: {visit.start} - {visit.end} / 担当エリア: {visit.area}</div>
                              {isEditing && (
                                <div className="time-edit-panel">
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
                              <div className="hover-actions visible-actions">
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
                <div className="section-title">確定</div>
                {dayScheduledGroups.length === 0 && <div className="empty small">確定なし</div>}
                {dayScheduledGroups.map((group) => (
                  <div key={`${day.dateKey}-confirmed-${group.address}`} className="address-group-card confirmed-address-group">
                    <div className="address-group-header confirmed-address-header">
                      <strong>{group.address}</strong>
                      <span>{group.visits.length}件FIX</span>
                    </div>
                    <div className="address-group-list">
                      {group.visits.map((visit) => {
                        const isEditing = editingScheduledId === visit.slotId;
                        return (
                          <div key={visit.slotId} className={`calendar-item confirmed confirmed-fixed ${isEditing ? 'editing-card' : ''}`} style={{ borderLeftColor: areaColors[visit.area] ?? '#cbd5e1' }}>
                            <div className="calendar-item-body">
                              <div className="calendar-item-title">【FIX】[{visit.start}-{visit.end}] {visit.userName}</div>
                              <div className="calendar-item-sub">{visit.address || visit.area}</div>
                              <div className="calendar-item-meta">時間: {visit.start} - {visit.end} / 担当: {visit.nurseName || '未割当'} / エリア: {visit.area}</div>
                              {isEditing && (
                                <div className="time-edit-panel dark-panel">
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
                              <div className="confirmed-actions">
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

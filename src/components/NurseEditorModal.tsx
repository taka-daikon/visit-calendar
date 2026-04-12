import { Nurse, WeekdayJa } from '../types';

interface NurseEditorDraft extends Nurse {
  editDateKey: string;
  shiftStart: string;
  shiftEnd: string;
}

interface Props {
  draft: NurseEditorDraft;
  onChange: (draft: NurseEditorDraft) => void;
  onClose: () => void;
  onSave: () => void;
}

const WEEKDAYS: WeekdayJa[] = ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜'];

export function NurseEditorModal({ draft, onChange, onClose, onSave }: Props) {
  const toggleWeekday = (weekday: WeekdayJa) => {
    const exists = draft.workingWeekdays.includes(weekday);
    onChange({
      ...draft,
      workingWeekdays: exists ? draft.workingWeekdays.filter((item) => item !== weekday) : [...draft.workingWeekdays, weekday]
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card form-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header split-line">
          <div>
            <h2>看護師BOX編集</h2>
            <p className="helper-text">看護師名、勤務曜日、対応時間、担当エリアやスキルをその場で調整できます。</p>
          </div>
          <button onClick={onClose}>閉じる</button>
        </div>

        <div className="field-grid form-grid-2col">
          <label>看護師名<input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} /></label>
          <label>住所<input value={draft.address || ''} onChange={(e) => onChange({ ...draft, address: e.target.value })} placeholder="岡山市北区奥田1-1-1" /></label>
          <label>性別
            <select value={draft.gender} onChange={(e) => onChange({ ...draft, gender: e.target.value as Nurse['gender'] })}>
              <option value="女性">女性</option>
              <option value="男性">男性</option>
            </select>
          </label>
          <label>雇用区分
            <select value={draft.employmentType} onChange={(e) => onChange({ ...draft, employmentType: e.target.value as Nurse['employmentType'] })}>
              <option value="常勤">常勤</option>
              <option value="非常勤">非常勤</option>
            </select>
          </label>
          <label>1日上限件数<input type="number" min={1} max={20} value={draft.maxVisitsPerDay} onChange={(e) => onChange({ ...draft, maxVisitsPerDay: Number(e.target.value) })} /></label>
          <label className="checkbox-inline"><input type="checkbox" checked={draft.active} onChange={(e) => onChange({ ...draft, active: e.target.checked })} />稼働中</label>
          <div className="shift-availability-row">
            <label className="checkbox-inline"><input type="checkbox" checked={draft.shiftAvailability.午前} onChange={(e) => onChange({ ...draft, shiftAvailability: { ...draft.shiftAvailability, 午前: e.target.checked } })} />午前可</label>
            <label className="checkbox-inline"><input type="checkbox" checked={draft.shiftAvailability.午後} onChange={(e) => onChange({ ...draft, shiftAvailability: { ...draft.shiftAvailability, 午後: e.target.checked } })} />午後可</label>
          </div>
          <div className="form-span-2">
            <span className="form-label">勤務曜日</span>
            <div className="weekday-chip-row">
              {WEEKDAYS.map((weekday) => (
                <button key={weekday} type="button" className={`weekday-chip ${draft.workingWeekdays.includes(weekday) ? 'active' : ''}`} onClick={() => toggleWeekday(weekday)}>
                  {weekday}
                </button>
              ))}
            </div>
          </div>
          <label>担当エリア<input value={draft.areas.join(',')} onChange={(e) => onChange({ ...draft, areas: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="岡山市北区, 岡山市中区" /></label>
          <label>スキル<input value={draft.skills.join(',')} onChange={(e) => onChange({ ...draft, skills: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="褥瘡処置, 清潔ケア" /></label>
          {draft.editDateKey && (
            <>
              <label>対象日<input value={draft.editDateKey} readOnly /></label>
              <div className="field-grid">
                <label>開始<input type="time" step={600} value={draft.shiftStart} onChange={(e) => onChange({ ...draft, shiftStart: e.target.value })} /></label>
                <label>終了<input type="time" step={600} value={draft.shiftEnd} onChange={(e) => onChange({ ...draft, shiftEnd: e.target.value })} /></label>
              </div>
            </>
          )}
        </div>

        <div className="toolbar-actions left modal-actions">
          <button className="primary" onClick={onSave}>保存</button>
          <button onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

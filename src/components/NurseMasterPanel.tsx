import { useState } from 'react';
import { Nurse } from '../types';

interface Props {
  nurses: Nurse[];
  onToggleActive: (id: string) => void;
  onAdd: (nurse: Omit<Nurse, 'id'>) => void;
}

const defaultDraft: Omit<Nurse, 'id'> = {
  name: '',
  gender: '女性',
  employmentType: '常勤',
  active: true,
  maxVisitsPerDay: 6,
  workingWeekdays: ['月曜', '火曜', '水曜', '木曜', '金曜'],
  shiftAvailability: { 午前: true, 午後: true },
  skills: ['基本看護'],
  areas: []
};

export function NurseMasterPanel({ nurses, onToggleActive, onAdd }: Props) {
  const [draft, setDraft] = useState(defaultDraft);

  return (
    <section className="card panel">
      <h2>担当看護師マスタ</h2>
      <div className="compact-list">
        {nurses.map((nurse) => (
          <article key={nurse.id} className="mini-card">
            <div className="split-line">
              <strong>{nurse.name}</strong>
              <button onClick={() => onToggleActive(nurse.id)}>{nurse.active ? '稼働中' : '停止中'}</button>
            </div>
            <div>{nurse.gender} / {nurse.employmentType} / 上限 {nurse.maxVisitsPerDay}件</div>
            <div>勤務: {nurse.workingWeekdays.join('・')} / 午前:{nurse.shiftAvailability.午前 ? '可' : '不可'} / 午後:{nurse.shiftAvailability.午後 ? '可' : '不可'}</div>
            <div>スキル: {nurse.skills.join(' / ')}</div>
            <div>エリア: {nurse.areas.join(' / ')}</div>
          </article>
        ))}
      </div>
      <div className="field-grid">
        <label>氏名<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>性別<select value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value as Nurse['gender'] })}><option value="女性">女性</option><option value="男性">男性</option></select></label>
        <label>雇用<select value={draft.employmentType} onChange={(e) => setDraft({ ...draft, employmentType: e.target.value as Nurse['employmentType'] })}><option value="常勤">常勤</option><option value="非常勤">非常勤</option></select></label>
        <label>1日上限<input type="number" min={1} max={12} value={draft.maxVisitsPerDay} onChange={(e) => setDraft({ ...draft, maxVisitsPerDay: Number(e.target.value) })} /></label>
        <label>エリア<input value={draft.areas.join(',')} onChange={(e) => setDraft({ ...draft, areas: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder="岡山市北区,岡山市中区" /></label>
        <label>スキル<input value={draft.skills.join(',')} onChange={(e) => setDraft({ ...draft, skills: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder="褥瘡処置,清潔ケア" /></label>
      </div>
      <button className="primary" onClick={() => { if (!draft.name.trim()) return; onAdd(draft); setDraft(defaultDraft); }}>看護師を追加</button>
    </section>
  );
}

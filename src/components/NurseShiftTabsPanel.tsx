import { Nurse } from '../types';

interface Props {
  nurses: Nurse[];
  selectedNurseId: string;
  onSelectNurseId: (nurseId: string) => void;
}

export function NurseShiftTabsPanel({ nurses, selectedNurseId, onSelectNurseId }: Props) {
  return (
    <section className="card panel nurse-shift-panel">
      <div className="split-line nurse-shift-header">
        <div>
          <h2>看護師シフト切替</h2>
          <p className="helper-text">看護師名タブを押すと、その看護師のシフトBOXをカレンダーへ反映します。シフトBOXも時間変更・ドラッグ＆ドロップ・確定・削除に対応しています。</p>
        </div>
      </div>
      <div className="business-tab-list nurse-shift-tabs">
        <button className={`business-tab ${selectedNurseId === '' ? 'active' : ''}`} onClick={() => onSelectNurseId('')}>全看護師</button>
        {nurses.map((nurse) => (
          <button
            key={nurse.id}
            className={`business-tab ${selectedNurseId === nurse.id ? 'active' : ''}`}
            onClick={() => onSelectNurseId(nurse.id)}
          >
            {nurse.name}
          </button>
        ))}
      </div>
    </section>
  );
}

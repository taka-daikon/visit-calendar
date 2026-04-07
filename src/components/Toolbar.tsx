import { ViewMode } from '../types';

interface ToolbarProps {
  periodLabel: string;
  reloadLabel: string;
  businessName: string;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onAutoAssign: () => void;
}

export function Toolbar({ periodLabel, reloadLabel, businessName, viewMode, onChangeViewMode, onPrev, onNext, onExportCsv, onExportPdf, onAutoAssign }: ToolbarProps) {
  return (
    <header className="toolbar card">
      <div>
        <h1>訪問看護スケジューラ</h1>
        <p className="toolbar-period-sub">現在表示: {periodLabel} / 事業所: {businessName}</p>
        <p className="toolbar-refresh-sub">最終再読込: {reloadLabel}</p>
      </div>
      <div className="toolbar-actions">
        <button onClick={onPrev}>← 前へ</button>
        <button onClick={onNext}>次へ →</button>
        <select value={viewMode} onChange={(e) => onChangeViewMode(e.target.value as ViewMode)}>
          <option value="month">月表示</option>
          <option value="week">週表示</option>
          <option value="day">日表示</option>
        </select>
        <button className="primary" onClick={onAutoAssign}>最適割当</button>
        <button onClick={onExportCsv}>CSV出力</button>
        <button onClick={onExportPdf}>PDF出力</button>
      </div>
    </header>
  );
}

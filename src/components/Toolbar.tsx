import { ViewMode } from '../types';

interface ToolbarProps {
  periodLabel: string;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

export function Toolbar({ periodLabel, viewMode, onChangeViewMode, onPrev, onNext, onExportCsv, onExportPdf }: ToolbarProps) {
  return (
    <header className="toolbar card">
      <div>
        <h1>訪問看護スケジューラ</h1>
        <p>{periodLabel}</p>
      </div>
      <div className="toolbar-actions">
        <button onClick={onPrev}>← 前へ</button>
        <button onClick={onNext}>次へ →</button>
        <select value={viewMode} onChange={(e) => onChangeViewMode(e.target.value as ViewMode)}>
          <option value="month">月表示</option>
          <option value="week">週表示</option>
          <option value="day">日表示</option>
        </select>
        <button onClick={onExportCsv}>CSV出力</button>
        <button onClick={onExportPdf}>PDF出力</button>
      </div>
    </header>
  );
}

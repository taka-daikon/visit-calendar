import { ViewMode } from '../types';

interface ToolbarProps {
  periodLabel: string;
  reloadLabel: string;
  businessName: string;
  selectedNurseName: string;
  authRole: 'admin' | 'nurse';
  viewMode: ViewMode;
  unassignedCount: number;
  menuOpen: boolean;
  onChangeViewMode: (mode: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onAutoAssign: () => void;
  onOpenRouteModal: () => void;
  onToggleMenu: () => void;
}

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'month', label: '月' },
  { value: 'week', label: '週' },
  { value: 'day', label: '日' }
];

export function Toolbar({
  periodLabel,
  reloadLabel,
  businessName,
  selectedNurseName,
  authRole,
  viewMode,
  unassignedCount,
  menuOpen,
  onChangeViewMode,
  onPrev,
  onNext,
  onExportCsv,
  onExportPdf,
  onAutoAssign,
  onOpenRouteModal,
  onToggleMenu
}: ToolbarProps) {
  return (
    <header className="toolbar card">
      <div className="toolbar-primary-row">
        <div className="toolbar-brand-block">
          <div className="toolbar-brand-mark">訪看</div>
          <div>
            <h1>訪問看護スケジューラ</h1>
            <p className="toolbar-period-sub">{periodLabel} / {businessName}</p>
            <p className="toolbar-refresh-sub">表示中: {selectedNurseName} ・ 最終更新: {reloadLabel}</p>
          </div>
        </div>

        <div className="toolbar-right-block">
          <div className="toolbar-chip-row">
            <span className={`role-chip ${authRole === 'admin' ? 'role-admin' : 'role-nurse'}`}>
              {authRole === 'admin' ? '本部ビュー' : '看護師ビュー'}
            </span>
            <span className={`status-chip ${unassignedCount > 0 ? 'status-alert' : 'status-ok'}`}>
              未割当 {unassignedCount}件
            </span>
          </div>
          <div className="toolbar-actions">
            <button className="ghost-button" onClick={onExportCsv}>CSV</button>
            <button className="ghost-button" onClick={onExportPdf}>PDF</button>
            {authRole === 'admin' && <button className="primary" onClick={onAutoAssign}>最適割当</button>}
            <button className="secondary-accent" onClick={onOpenRouteModal}>最適訪問ルート</button>
            <button className={`menu-toggle ${menuOpen ? 'active' : ''}`} onClick={onToggleMenu} aria-label="メニューを開く">
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </div>

      <div className="toolbar-secondary-row">
        <div className="toolbar-nav-group">
          <button onClick={onPrev}>← 前へ</button>
          <div className="view-switch" role="tablist" aria-label="表示切替">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`view-switch-button ${viewMode === option.value ? 'active' : ''}`}
                onClick={() => onChangeViewMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button onClick={onNext}>次へ →</button>
        </div>
      </div>
    </header>
  );
}

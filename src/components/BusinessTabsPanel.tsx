interface BusinessItem {
  id: string;
  name: string;
}

interface Props {
  businesses: BusinessItem[];
  activeBusinessId: string;
  newBusinessName: string;
  onChangeNewBusinessName: (value: string) => void;
  onAddBusiness: () => void;
  onSwitchBusiness: (businessId: string) => void;
}

export function BusinessTabsPanel({ businesses, activeBusinessId, newBusinessName, onChangeNewBusinessName, onAddBusiness, onSwitchBusiness }: Props) {
  return (
    <section className="card panel business-panel">
      <div className="split-line business-panel-header">
        <div>
          <h2>事業所切替</h2>
          <p className="helper-text">事業所登録ボタンで名称を追加すると、タブから即座に切り替えできます。事業所ごとに利用者・看護師・確定スケジュール・下書きを分けて保存します。</p>
        </div>
        <div className="business-register-row">
          <input
            value={newBusinessName}
            onChange={(e) => onChangeNewBusinessName(e.target.value)}
            placeholder="新しい事業所名を入力"
          />
          <button className="primary" onClick={onAddBusiness}>事業所登録</button>
        </div>
      </div>
      <div className="business-tab-list">
        {businesses.map((business) => (
          <button
            key={business.id}
            className={`business-tab ${business.id === activeBusinessId ? 'active' : ''}`}
            onClick={() => onSwitchBusiness(business.id)}
          >
            {business.name}
          </button>
        ))}
      </div>
    </section>
  );
}

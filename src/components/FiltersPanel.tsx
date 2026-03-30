import { Filters } from '../types';

interface Props {
  filters: Filters;
  areas: string[];
  onChange: (filters: Filters) => void;
}

export function FiltersPanel({ filters, areas, onChange }: Props) {
  return (
    <section className="card panel">
      <h2>検索・絞り込み</h2>
      <div className="field-grid">
        <label>
          キーワード
          <input value={filters.keyword} onChange={(e) => onChange({ ...filters, keyword: e.target.value })} placeholder="氏名・居住地・処置内容" />
        </label>
        <label>
          エリア
          <select value={filters.area} onChange={(e) => onChange({ ...filters, area: e.target.value })}>
            <option value="">すべて</option>
            {areas.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </label>
        <label>
          保険区分
          <select value={filters.insuranceType} onChange={(e) => onChange({ ...filters, insuranceType: e.target.value as Filters['insuranceType'] })}>
            <option value="">すべて</option>
            <option value="医療保険">医療保険</option>
            <option value="介護保険">介護保険</option>
          </select>
        </label>
        <label>
          看護師性別希望
          <select value={filters.nurseGender} onChange={(e) => onChange({ ...filters, nurseGender: e.target.value as Filters['nurseGender'] })}>
            <option value="">すべて</option>
            <option value="男性">男性</option>
            <option value="女性">女性</option>
          </select>
        </label>
      </div>
    </section>
  );
}

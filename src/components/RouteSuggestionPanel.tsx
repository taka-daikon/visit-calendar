import { Nurse, RouteSuggestion } from '../types';

interface Props {
  nurses: Nurse[];
  selectedNurseId: string;
  onSelectNurseId: (value: string) => void;
  route: RouteSuggestion | null;
  onSuggest: () => void;
}

export function RouteSuggestionPanel({ nurses, selectedNurseId, onSelectNurseId, route, onSuggest }: Props) {
  return (
    <section className="card panel">
      <h2>最適訪問ルート提案</h2>
      <div className="field-grid route-toolbar">
        <label>
          看護師
          <select value={selectedNurseId} onChange={(e) => onSelectNurseId(e.target.value)}>
            <option value="">選択してください</option>
            {nurses.map((nurse) => <option key={nurse.id} value={nurse.id}>{nurse.name}</option>)}
          </select>
        </label>
        <button className="primary" onClick={onSuggest} disabled={!selectedNurseId}>ルート提案を更新</button>
      </div>
      {!route ? <p className="empty">看護師を選択して当日の確定訪問からルート提案を生成します。</p> : (
        <>
          <div className="stats-grid two-col">
            <article className="stat-card"><span>総距離</span><strong>{route.totalDistanceKm.toFixed(1)} km</strong></article>
            <article className="stat-card"><span>総移動時間</span><strong>{route.totalDurationMinutes} 分</strong></article>
            <article className="stat-card"><span>算出方式</span><strong>{route.provider === 'google-maps' ? 'Google Maps' : 'フォールバック'}</strong></article>
          </div>
          <ol className="route-list">
            {route.orderedVisits.map((visit) => (
              <li key={visit.slotId}>[{visit.start}-{visit.end}] {visit.userName} / {visit.area} {visit.estimatedTravelKm ? ` / ${visit.estimatedTravelKm}km` : ''}</li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

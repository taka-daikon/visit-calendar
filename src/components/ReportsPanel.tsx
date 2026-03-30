import { MonthlyReport } from '../types';

export function ReportsPanel({ report }: { report: MonthlyReport }) {
  return (
    <section className="card panel">
      <h2>月次レポート</h2>
      <div className="stats-grid two-col">
        <article className="stat-card"><span>確定訪問件数</span><strong>{report.totalConfirmedVisits}</strong></article>
        <article className="stat-card"><span>医療保険</span><strong>{report.byInsurance['医療保険']}</strong></article>
        <article className="stat-card"><span>介護保険</span><strong>{report.byInsurance['介護保険']}</strong></article>
      </div>
      <table className="report-table">
        <thead><tr><th>エリア</th><th>候補</th><th>確定</th><th>稼働率</th><th>移動効率</th></tr></thead>
        <tbody>
          {report.byArea.map((item) => (
            <tr key={item.area}>
              <td>{item.area}</td>
              <td>{item.candidateCount}</td>
              <td>{item.confirmedCount}</td>
              <td>{item.utilizationRate}%</td>
              <td>{item.movementEfficiencyScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

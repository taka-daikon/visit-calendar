import { DocumentDeadline, MonthlyReport, ReviewAlert, ScheduledVisit, UserRecord } from '../types';
import { addMonths, daysBetween } from './date';

function cycleToMonths(cycle: string): number {
  const matched = cycle.match(/(\d+)/);
  return matched ? Number(matched[1]) : 1;
}

export function buildReviewAlerts(users: UserRecord[], today: Date): ReviewAlert[] {
  return users.map((user): ReviewAlert => {
    if (!user.前回更新日) {
      return {
        userId: user.id,
        userName: user.利用者名,
        area: user.居住地,
        insuranceType: user.保険区分,
        updateCycle: user.更新サイクル,
        dueDate: '-',
        daysRemaining: 999,
        status: 'needs-base-date'
      };
    }
    const base = new Date(user.前回更新日);
    const dueDateObj = addMonths(base, cycleToMonths(user.更新サイクル));
    const dueDate = dueDateObj.toISOString().slice(0, 10);
    const daysRemaining = daysBetween(today, dueDateObj);
    const status: ReviewAlert['status'] = daysRemaining < 0 ? 'overdue' : daysRemaining <= 14 ? 'warning' : 'normal';
    return {
      userId: user.id,
      userName: user.利用者名,
      area: user.居住地,
      insuranceType: user.保険区分,
      updateCycle: user.更新サイクル,
      dueDate,
      daysRemaining,
      status
    };
  }).sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function buildDocumentDeadlines(users: UserRecord[], today: Date): DocumentDeadline[] {
  return users
    .filter((user) => Boolean(user.書類期限日))
    .map((user): DocumentDeadline => {
      const dueDateObj = new Date(user.書類期限日 as string);
      return {
        userId: user.id,
        userName: user.利用者名,
        area: user.居住地,
        insuranceType: user.保険区分,
        dueDate: dueDateObj.toISOString().slice(0, 10),
        daysRemaining: daysBetween(today, dueDateObj),
        kind: (user.保険区分 === '介護保険' ? '介護計画書' : '医療指示書') as DocumentDeadline['kind']
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function buildMonthlyReport(candidates: { area: string }[], scheduled: ScheduledVisit[], routeKmByArea: Record<string, number>): MonthlyReport {
  const byInsurance = { 医療保険: 0, 介護保険: 0 } as Record<'医療保険' | '介護保険', number>;
  scheduled.forEach((visit) => {
    byInsurance[visit.insuranceType] += 1;
  });

  const areaNames = Array.from(new Set([...candidates.map((item) => item.area), ...scheduled.map((item) => item.area)])).sort((a, b) => a.localeCompare(b, 'ja'));
  const byArea = areaNames.map((area) => {
    const candidateCount = candidates.filter((item) => item.area === area).length;
    const confirmedCount = scheduled.filter((item) => item.area === area).length;
    const utilizationRate = candidateCount ? Math.round((confirmedCount / candidateCount) * 100) : 0;
    const routeKm = routeKmByArea[area] ?? 0;
    const movementEfficiencyScore = Math.max(0, Math.round(utilizationRate * 0.6 + Math.max(0, 100 - routeKm * 10) * 0.4));
    return { area, candidateCount, confirmedCount, utilizationRate, movementEfficiencyScore };
  });

  return {
    totalConfirmedVisits: scheduled.length,
    byInsurance,
    byArea
  };
}

export function monthlyReportToCsv(report: MonthlyReport): string {
  const summary = [
    ['項目', '値'],
    ['確定訪問件数', String(report.totalConfirmedVisits)],
    ['医療保険', String(report.byInsurance['医療保険'])],
    ['介護保険', String(report.byInsurance['介護保険'])],
    []
  ].map((row) => row.join(',')).join('\n');

  const areas = ['エリア,候補件数,確定件数,稼働率,移動効率スコア', ...report.byArea.map((item) => `${item.area},${item.candidateCount},${item.confirmedCount},${item.utilizationRate}%,${item.movementEfficiencyScore}`)].join('\n');
  return `${summary}\n${areas}`;
}

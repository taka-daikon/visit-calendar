import { CandidateVisit, ConflictWarning, Nurse, RouteSuggestion, ScheduledVisit } from '../types';
import { AREA_COORDS, timeToMinutes } from './calendar';

function visitShift(visit: CandidateVisit | ScheduledVisit): '午前' | '午後' {
  return visit.startMinutes < 12 * 60 ? '午前' : '午後';
}

function overlaps(a: { startMinutes: number; endMinutes: number }, b: { startMinutes: number; endMinutes: number }): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

function withinRange(range: string, visit: CandidateVisit | ScheduledVisit): boolean {
  const [start, end] = range.split('-').map((value) => value.trim());
  if (!start || !end) return false;
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  return visit.startMinutes >= startMinutes && visit.endMinutes <= endMinutes;
}

function nurseAvailableOnDate(nurse: Nurse, visit: CandidateVisit): boolean {
  const explicit = nurse.monthlyShiftDetails?.[visit.dateKey];
  if (explicit) {
    const availableEntries = explicit.filter((entry) => !entry.deleted);
    if (!availableEntries.length) return false;
    return availableEntries.some((entry) => visit.startMinutes >= entry.startMinutes && visit.endMinutes <= entry.endMinutes);
  }

  const dayKey = `${new Date(visit.dateKey).getDate()}日`;
  const monthlyAvailability = nurse.monthlyAvailability ?? {};
  const hasMonthlyRules = Object.keys(monthlyAvailability).length > 0;
  const targetMonth = nurse.monthlyAvailabilityMonth?.trim();
  const visitMonth = visit.dateKey.slice(0, 7);

  if (hasMonthlyRules && (!targetMonth || targetMonth === visitMonth)) {
    const range = monthlyAvailability[dayKey];
    if (!range) return false;
    return range.split('|').some((item) => withinRange(item.trim(), visit));
  }

  return true;
}

function haversineKm(aArea: string, bArea: string): number {
  const a = AREA_COORDS[aArea];
  const b = AREA_COORDS[bArea];
  if (!a || !b) return aArea === bArea ? 0 : 8;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

export function autoAssignNurse(
  visit: CandidateVisit,
  nurses: Nurse[],
  scheduledVisits: ScheduledVisit[]
): { nurse: Nurse | null; score: number } {
  const candidates = nurses.filter((nurse) => {
    if (!nurse.active) return false;
    if (visit.genderPreference !== '希望なし' && nurse.gender !== visit.genderPreference) return false;
    if (!nurse.workingWeekdays.includes(visit.weekday)) return false;
    const shift = visitShift(visit);
    if (!nurse.shiftAvailability[shift]) return false;
    if (!visit.requiredSkills.every((skill) => nurse.skills.includes(skill) || nurse.skills.includes('基本看護'))) return false;
    if (!nurseAvailableOnDate(nurse, visit)) return false;

    const sameDayVisits = scheduledVisits.filter((item) => item.nurseId === nurse.id && item.dateKey === visit.dateKey);
    if (sameDayVisits.length >= nurse.maxVisitsPerDay) return false;
    if (sameDayVisits.some((item) => overlaps(item, visit))) return false;
    return true;
  });

  if (!candidates.length) return { nurse: null, score: 0 };

  const scored = candidates.map((nurse) => {
    const sameDayVisits = scheduledVisits.filter((item) => item.nurseId === nurse.id && item.dateKey === visit.dateKey);
    const sameAreaCount = sameDayVisits.filter((item) => item.area === visit.area).length;
    const areaMatch = nurse.areas.includes(visit.area) ? 24 : 0;
    const skillScore = visit.requiredSkills.reduce((sum, skill) => sum + (nurse.skills.includes(skill) ? 12 : 0), 0);
    const employmentScore = nurse.employmentType === '常勤' ? 8 : 2;
    const loadPenalty = sameDayVisits.length * 6;
    const nearestDistance = sameDayVisits.length
      ? Math.min(...sameDayVisits.map((item) => haversineKm(item.area, visit.area)))
      : haversineKm(nurse.areas[0] ?? visit.area, visit.area);
    const distanceScore = Math.max(0, 30 - nearestDistance * 3);
    const preferredNurseBonus = visit.preferredNurseId === nurse.id || (visit.preferredNurseName && visit.preferredNurseName === nurse.name) ? 120 : 0;
    const score = 100 + preferredNurseBonus + areaMatch + skillScore + employmentScore + sameAreaCount * 10 + distanceScore - loadPenalty;
    return { nurse, score };
  }).sort((a, b) => b.score - a.score || a.nurse.name.localeCompare(b.nurse.name, 'ja'));

  return scored[0];
}

export function buildConflictWarnings(visits: ScheduledVisit[]): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const byDate = visits.reduce<Record<string, ScheduledVisit[]>>((acc, visit) => {
    acc[visit.dateKey] ??= [];
    acc[visit.dateKey].push(visit);
    return acc;
  }, {});

  Object.entries(byDate).forEach(([dateKey, dayVisits]) => {
    for (let i = 0; i < dayVisits.length; i += 1) {
      for (let j = i + 1; j < dayVisits.length; j += 1) {
        const left = dayVisits[i];
        const right = dayVisits[j];
        if (!overlaps(left, right)) continue;
        if (left.nurseId && left.nurseId === right.nurseId) {
          warnings.push({
            type: 'nurse-overlap',
            dateKey,
            slotIds: [left.slotId, right.slotId],
            message: `${dateKey}: ${left.nurseName} の訪問が重複しています (${left.userName} / ${right.userName})`
          });
        }
        if (left.userId === right.userId) {
          warnings.push({
            type: 'user-duplicate',
            dateKey,
            slotIds: [left.slotId, right.slotId],
            message: `${dateKey}: ${left.userName} に同一時間帯の重複訪問があります`
          });
        }
      }
    }
  });

  return warnings;
}

export function buildFallbackRouteSuggestion(
  nurse: Nurse,
  dateKey: string,
  visits: ScheduledVisit[]
): RouteSuggestion | null {
  const nurseVisits = visits
    .filter((visit) => visit.nurseId === nurse.id && visit.dateKey === dateKey)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.area.localeCompare(b.area, 'ja'));
  if (!nurseVisits.length) return null;

  let totalDistanceKm = 0;
  let totalDurationMinutes = 0;
  const orderedVisits = nurseVisits.map((visit, index) => {
    const prevArea = index === 0 ? nurse.areas[0] ?? visit.area : nurseVisits[index - 1].area;
    const km = haversineKm(prevArea, visit.area);
    totalDistanceKm += km;
    totalDurationMinutes += Math.round((km / 25) * 60);
    return { ...visit, routeOrder: index + 1, estimatedTravelKm: Number(km.toFixed(1)), estimatedTravelMinutes: Math.round((km / 25) * 60) };
  });

  return {
    nurseId: nurse.id,
    nurseName: nurse.name,
    dateKey,
    orderedVisits,
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
    totalDurationMinutes,
    provider: 'fallback'
  };
}

export function toRouteCsv(route: RouteSuggestion): string {
  const header = '順番,日付,看護師,利用者,エリア,開始,終了,移動km,移動分\n';
  const rows = route.orderedVisits.map((visit) => [
    visit.routeOrder,
    route.dateKey,
    route.nurseName,
    visit.userName,
    visit.area,
    visit.start,
    visit.end,
    visit.estimatedTravelKm ?? '',
    visit.estimatedTravelMinutes ?? ''
  ].join(','));
  return header + rows.join('\n');
}

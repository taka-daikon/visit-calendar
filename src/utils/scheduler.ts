import { CandidateVisit, ConflictWarning, Nurse, RouteSuggestion, ScheduledVisit } from '../types';
import { AREA_COORDS, extractAreaName, minutesToTime, timeToMinutes } from './calendar';

const TRAVEL_BUFFER_MINUTES = 15;

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

function normalizeRange(raw: string): { start: string; end: string; startMinutes: number; endMinutes: number } | null {
  const [start, end] = raw.split('-').map((value) => value.trim());
  if (!start || !end) return null;
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || startMinutes >= endMinutes) return null;
  return { start, end, startMinutes, endMinutes };
}

function resolveNurseAvailabilityRanges(nurse: Nurse, visit: CandidateVisit): Array<{ start: string; end: string; startMinutes: number; endMinutes: number }> {
  const explicit = nurse.monthlyShiftDetails?.[visit.dateKey];
  if (explicit) {
    return explicit
      .filter((entry) => !entry.deleted)
      .map((entry) => ({ start: entry.start, end: entry.end, startMinutes: entry.startMinutes, endMinutes: entry.endMinutes }))
      .filter((entry) => entry.startMinutes < entry.endMinutes)
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }

  const dayKey = `${new Date(`${visit.dateKey}T00:00:00`).getDate()}日`;
  const monthlyAvailability = nurse.monthlyAvailability ?? {};
  const hasMonthlyRules = Object.keys(monthlyAvailability).length > 0;
  const targetMonth = nurse.monthlyAvailabilityMonth?.trim();
  const visitMonth = visit.dateKey.slice(0, 7);

  if (hasMonthlyRules && (!targetMonth || targetMonth === visitMonth)) {
    return String(monthlyAvailability[dayKey] || '')
      .split('|')
      .map((item) => normalizeRange(item.trim()))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }

  if (!nurse.workingWeekdays.includes(visit.weekday)) return [];
  const fallbackRanges: string[] = [];
  if (nurse.shiftAvailability.午前) fallbackRanges.push('09:00-12:00');
  if (nurse.shiftAvailability.午後) fallbackRanges.push('13:00-18:00');
  return fallbackRanges
    .map((item) => normalizeRange(item))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function nurseAvailableOnDate(nurse: Nurse, visit: CandidateVisit): boolean {
  const ranges = resolveNurseAvailabilityRanges(nurse, visit);
  if (!ranges.length) return false;
  return ranges.some((entry) => withinRange(`${entry.start}-${entry.end}`, visit));
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

function placementConflicts(startMinutes: number, endMinutes: number, scheduledVisits: ScheduledVisit[]): boolean {
  return scheduledVisits.some((item) => startMinutes < item.endMinutes + TRAVEL_BUFFER_MINUTES && item.startMinutes - TRAVEL_BUFFER_MINUTES < endMinutes);
}

function placeVisitWithinWindow(
  visit: CandidateVisit,
  nurse: Nurse,
  scheduledVisits: ScheduledVisit[]
): CandidateVisit | null {
  const sameDayVisits = scheduledVisits
    .filter((item) => item.nurseId === nurse.id && item.dateKey === visit.dateKey)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  if (sameDayVisits.length >= nurse.maxVisitsPerDay) return null;

  const duration = Math.max(15, visit.serviceDurationMinutes || visit.endMinutes - visit.startMinutes || 30);
  const windowStartMinutes = visit.windowStartMinutes ?? visit.startMinutes;
  const windowEndMinutes = visit.windowEndMinutes ?? visit.endMinutes;
  const ranges = resolveNurseAvailabilityRanges(nurse, visit);
  if (!ranges.length) return null;

  let bestVisit: CandidateVisit | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  ranges.forEach((range) => {
    const earliestStart = Math.max(windowStartMinutes, range.startMinutes);
    const latestStart = Math.min(windowEndMinutes - duration, range.endMinutes - duration);
    if (latestStart < earliestStart) return;

    for (let candidateStart = earliestStart; candidateStart <= latestStart; candidateStart += 15) {
      const candidateEnd = candidateStart + duration;
      if (placementConflicts(candidateStart, candidateEnd, sameDayVisits)) continue;

      const previousVisit = [...sameDayVisits]
        .filter((item) => item.endMinutes <= candidateStart)
        .sort((a, b) => b.endMinutes - a.endMinutes)[0];
      const nextVisit = [...sameDayVisits]
        .filter((item) => item.startMinutes >= candidateEnd)
        .sort((a, b) => a.startMinutes - b.startMinutes)[0];

      const previousGap = previousVisit ? candidateStart - previousVisit.endMinutes : 45;
      const nextGap = nextVisit ? nextVisit.startMinutes - candidateEnd : 45;
      const sameAddressBonus = sameDayVisits.some((item) => item.address === visit.address) ? 30 : 0;
      const sameAreaBonus = sameDayVisits.filter((item) => item.area === visit.area).length * 12;
      const windowCenter = (windowStartMinutes + windowEndMinutes) / 2;
      const centerDistancePenalty = Math.abs(candidateStart + duration / 2 - windowCenter) / 10;
      const adjacencyBonus = Math.max(0, 24 - Math.min(previousGap, nextGap));
      const score = sameAddressBonus + sameAreaBonus + adjacencyBonus - centerDistancePenalty - candidateStart / 10000;

      if (score > bestScore) {
        bestScore = score;
        bestVisit = {
          ...visit,
          start: minutesToTime(candidateStart),
          end: minutesToTime(candidateEnd),
          startMinutes: candidateStart,
          endMinutes: candidateEnd,
          serviceDurationMinutes: duration
        };
      }
    }
  });

  return bestVisit;
}

export function autoAssignNurse(
  visit: CandidateVisit,
  nurses: Nurse[],
  scheduledVisits: ScheduledVisit[]
): { nurse: Nurse | null; score: number; placedVisit: CandidateVisit | null; reason?: string } {
  const candidates = nurses.flatMap((nurse) => {
    if (!nurse.active) return [];
    if (visit.genderPreference !== '希望なし' && nurse.gender !== visit.genderPreference) return [];
    if (!nurse.workingWeekdays.includes(visit.weekday)) return [];
    const shift = visitShift(visit);
    if (!nurse.shiftAvailability[shift]) return [];
    if (!visit.requiredSkills.every((skill) => nurse.skills.includes(skill) || nurse.skills.includes('基本看護'))) return [];
    if (!nurseAvailableOnDate(nurse, visit)) return [];

    const placedVisit = placeVisitWithinWindow(visit, nurse, scheduledVisits);
    if (!placedVisit) return [];

    const sameDayVisits = scheduledVisits.filter((item) => item.nurseId === nurse.id && item.dateKey === visit.dateKey);
    const sameAreaCount = sameDayVisits.filter((item) => item.area === visit.area).length;
    const areaMatch = nurse.areas.includes(visit.area) ? 24 : 0;
    const skillScore = visit.requiredSkills.reduce((sum, skill) => sum + (nurse.skills.includes(skill) ? 12 : 0), 0);
    const employmentScore = nurse.employmentType === '常勤' ? 8 : 2;
    const loadPenalty = sameDayVisits.length * 6;
    const nearestDistance = sameDayVisits.length
      ? Math.min(...sameDayVisits.map((item) => haversineKm(item.area, visit.area)))
      : haversineKm(extractAreaName(nurse.address || nurse.areas[0] || visit.area), visit.area);
    const distanceScore = Math.max(0, 30 - nearestDistance * 3);
    const preferredNurseBonus = visit.preferredNurseId === nurse.id || (visit.preferredNurseName && visit.preferredNurseName === nurse.name) ? 120 : 0;
    const score = 100 + preferredNurseBonus + areaMatch + skillScore + employmentScore + sameAreaCount * 10 + distanceScore - loadPenalty;
    return [{ nurse, score, placedVisit }];
  });

  if (!candidates.length) {
    return {
      nurse: null,
      score: 0,
      placedVisit: null,
      reason: '訪問希望日時の条件が合いません。時間帯・担当看護師・勤務シフトを確認してください。'
    };
  }

  const scored = candidates.sort((a, b) => b.score - a.score || a.placedVisit.startMinutes - b.placedVisit.startMinutes || a.nurse.name.localeCompare(b.nurse.name, 'ja'));
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

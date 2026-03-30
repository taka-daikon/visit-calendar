import { CandidateVisit, CalendarDay, Filters, ScheduledVisit, UserRecord, WeekdayJa } from '../types';
import { formatDateKey, WEEKDAY_LABELS } from './date';
import { inferSkills } from './skills';

const TIME_COLUMN_MAP: Record<WeekdayJa, keyof UserRecord> = {
  日曜: '日曜希望時間',
  月曜: '月曜希望時間',
  火曜: '火曜希望時間',
  水曜: '水曜希望時間',
  木曜: '木曜希望時間',
  金曜: '金曜希望時間',
  土曜: '土曜希望時間'
};

export const AREA_COORDS: Record<string, { lat: number; lng: number; color: string }> = {
  '岡山市北区': { lat: 34.6617, lng: 133.935, color: '#E6F4EA' },
  '岡山市中区': { lat: 34.6552, lng: 133.9694, color: '#FFF5D6' },
  '岡山市南区': { lat: 34.6043, lng: 133.9185, color: '#F3E8FF' },
  '岡山市東区': { lat: 34.6791, lng: 134.0717, color: '#E6F0FF' },
  '倉敷市阿知': { lat: 34.6021, lng: 133.7665, color: '#FFE6E6' },
  '倉敷市水島': { lat: 34.5085, lng: 133.741, color: '#FFEEDB' },
  '総社市中央': { lat: 34.6751, lng: 133.7463, color: '#E8FFF2' },
  '玉野市築港': { lat: 34.4938, lng: 133.9478, color: '#EEF2FF' }
};

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function expandTimeRange(range: string): Array<{ start: string; end: string; startMinutes: number; endMinutes: number }> {
  if (!range) return [];
  const [start, end] = range.split('-').map((value) => value.trim());
  if (!start || !end) return [];
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const slots: Array<{ start: string; end: string; startMinutes: number; endMinutes: number }> = [];
  for (let cursor = startMinutes; cursor < endMinutes; cursor += 30) {
    const slotEnd = Math.min(cursor + 30, endMinutes);
    slots.push({
      start: minutesToTime(cursor),
      end: minutesToTime(slotEnd),
      startMinutes: cursor,
      endMinutes: slotEnd
    });
  }
  return slots;
}

export function getAreaColors(areas: string[]): Record<string, string> {
  return areas.reduce<Record<string, string>>((acc, area, index) => {
    acc[area] = AREA_COORDS[area]?.color ?? ['#E6F4EA', '#E6F0FF', '#FFF5D6', '#FDECEC', '#F3E8FF'][index % 5];
    return acc;
  }, {});
}

export function buildCandidateVisits(users: UserRecord[], days: CalendarDay[]): CandidateVisit[] {
  return days.flatMap((day) => {
    const weekday = WEEKDAY_LABELS[day.date.getDay()];
    return users.flatMap((user) => {
      if (!user.hopeDays.includes(weekday)) return [];
      const timeRange = String(user[TIME_COLUMN_MAP[weekday]] || '');
      if (!timeRange) return [];
      return expandTimeRange(timeRange).map((slot, index) => ({
        slotId: `${day.dateKey}-${user.id}-${slot.start}-${index}`,
        dateKey: day.dateKey,
        userId: user.id,
        userName: user.利用者名,
        area: user.居住地,
        insuranceType: user.保険区分,
        updateCycle: user.更新サイクル,
        genderPreference: user.希望性別,
        treatment: user.希望処置内容,
        requiredSkills: inferSkills(user.希望処置内容),
        weekday,
        ...slot
      }));
    });
  }).sort((a, b) => a.startMinutes - b.startMinutes || a.area.localeCompare(b.area, 'ja') || a.userName.localeCompare(b.userName, 'ja'));
}

export function applyFilters(visits: CandidateVisit[], filters: Filters): CandidateVisit[] {
  const keyword = filters.keyword.trim().toLowerCase();
  return visits.filter((visit) => {
    if (filters.area && visit.area !== filters.area) return false;
    if (filters.insuranceType && visit.insuranceType !== filters.insuranceType) return false;
    if (filters.nurseGender && visit.genderPreference !== '希望なし' && visit.genderPreference !== filters.nurseGender) return false;
    if (!keyword) return true;
    return [visit.userName, visit.area, visit.treatment].some((value) => value.toLowerCase().includes(keyword));
  });
}

export function groupByDate<T extends { dateKey: string }>(items: T[]): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    acc[item.dateKey] ??= [];
    acc[item.dateKey].push(item);
    return acc;
  }, {});
}

export function getUnscheduledCandidates(candidates: CandidateVisit[], scheduledMap: Record<string, ScheduledVisit>): CandidateVisit[] {
  return candidates.filter((visit) => !scheduledMap[visit.slotId]);
}

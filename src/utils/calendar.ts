import { CandidateVisit, CalendarDay, Filters, ScheduledVisit, UserRecord, WeekdayJa } from '../types';
import { WEEKDAY_LABELS } from './date';
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

const DEFAULT_SERVICE_DURATION_MINUTES = 30;

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

const AREA_KEYS = Object.keys(AREA_COORDS).sort((a, b) => b.length - a.length);

export function extractAreaName(address: string): string {
  const normalized = String(address ?? '').trim();
  if (!normalized) return '';
  const matched = AREA_KEYS.find((area) => normalized.startsWith(area));
  if (matched) return matched;
  const cityWard = normalized.match(/^(.*?(?:市.*?区|市|区|町|村))/)?.[1];
  return cityWard || normalized;
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function normalizeTimeRangeText(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/〜|～|–|—|ー|−|~|～/g, '-')
    .replace(/時/g, ':')
    .replace(/分/g, '')
    .replace(/：/g, ':')
    .replace(/\s+/g, '');
}

export function expandTimeRange(range: string): Array<{ start: string; end: string; startMinutes: number; endMinutes: number }> {
  if (!range) return [];
  return normalizeTimeRangeText(range)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      const [start, end] = item.split('-').map((value) => value.trim());
      if (!start || !end) return [];
      const startMinutes = timeToMinutes(start);
      const endMinutes = timeToMinutes(end);
      if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || startMinutes >= endMinutes) return [];
      return [{ start, end, startMinutes, endMinutes }];
    });
}

function resolveCommonVisitRange(user: UserRecord, weekday: WeekdayJa): string {
  const directRange = String(user[TIME_COLUMN_MAP[weekday]] || '').trim();
  if (directRange) return directRange;
  return String(user.訪問希望時間帯 || '').trim();
}

function normalizeDateList(value: string, referenceYear: number): string[] {
  return String(value ?? '')
    .split(/[|｜、/／,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const normalized = item.replace(/[.]/g, '/').replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '').trim();
      if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(normalized)) {
        const [y, m, d] = normalized.split(/[-/]/).map(Number);
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      if (/^\d{1,2}[-/]\d{1,2}$/.test(normalized)) {
        const [m, d] = normalized.split(/[-/]/).map(Number);
        return `${referenceYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      return '';
    })
    .filter(Boolean);
}

function overlapsRange(
  left: { startMinutes: number; endMinutes: number },
  right: { startMinutes: number; endMinutes: number }
): boolean {
  return left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes;
}

function blockedByNgRule(user: UserRecord, day: CalendarDay, slot: { startMinutes: number; endMinutes: number }): boolean {
  const ngDates = normalizeDateList(user.訪問NG日付 || user.過去履歴訪問NG || '', day.date.getFullYear());
  if (!ngDates.includes(day.dateKey)) return false;
  const ngStart = String(user.訪問NG開始時間 || '').trim();
  const ngEnd = String(user.訪問NG終了時間 || '').trim();
  if (!ngStart || !ngEnd) return true;
  const ngStartMinutes = timeToMinutes(normalizeTimeRangeText(ngStart));
  const ngEndMinutes = timeToMinutes(normalizeTimeRangeText(ngEnd));
  if (Number.isNaN(ngStartMinutes) || Number.isNaN(ngEndMinutes) || ngStartMinutes >= ngEndMinutes) return true;
  return overlapsRange(slot, { startMinutes: ngStartMinutes, endMinutes: ngEndMinutes });
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
      const timeRange = resolveCommonVisitRange(user, weekday);
      const slots = expandTimeRange(timeRange).filter((slot) => !blockedByNgRule(user, day, slot));
      if (!slots.length) return [];
      const address = String(user.居住地 ?? user.住所 ?? '').trim();
      const area = extractAreaName(address);
      return slots.map((slot) => {
        const serviceDurationMinutes = Math.max(15, Math.min(DEFAULT_SERVICE_DURATION_MINUTES, slot.endMinutes - slot.startMinutes));
        const startMinutes = slot.startMinutes;
        const endMinutes = Math.min(slot.endMinutes, slot.startMinutes + serviceDurationMinutes);
        return {
          slotId: `${day.dateKey}-${user.id}-${slot.start}-${slot.end}`,
          dateKey: day.dateKey,
          userId: user.id,
          userName: user.利用者名,
          address,
          area,
          insuranceType: user.保険区分,
          updateCycle: user.更新サイクル,
          genderPreference: user.希望性別,
          treatment: user.希望処置内容,
          requiredSkills: inferSkills(user.希望処置内容),
          weekday,
          boxColor: user.boxColor || user.カラー || '',
          preferredNurseId: user.preferredNurseId,
          preferredNurseName: user.preferredNurseName || user.担当看護師名 || '',
          windowStart: slot.start,
          windowEnd: slot.end,
          windowStartMinutes: slot.startMinutes,
          windowEndMinutes: slot.endMinutes,
          serviceDurationMinutes,
          start: minutesToTime(startMinutes),
          end: minutesToTime(endMinutes),
          startMinutes,
          endMinutes
        } satisfies CandidateVisit;
      });
    });
  }).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.windowStartMinutes - b.windowStartMinutes || a.address.localeCompare(b.address, 'ja') || a.userName.localeCompare(b.userName, 'ja'));
}

export function applyFilters(visits: CandidateVisit[], filters: Filters): CandidateVisit[] {
  const keyword = filters.keyword.trim().toLowerCase();
  return visits.filter((visit) => {
    if (filters.area && visit.area !== filters.area) return false;
    if (filters.insuranceType && visit.insuranceType !== filters.insuranceType) return false;
    if (filters.nurseGender && visit.genderPreference !== '希望なし' && visit.genderPreference !== filters.nurseGender) return false;
    if (!keyword) return true;
    return [visit.userName, visit.address, visit.area, visit.treatment].some((value) => value.toLowerCase().includes(keyword));
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

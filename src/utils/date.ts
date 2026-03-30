import { CalendarDay, ViewMode, WeekdayJa } from '../types';

export const START_YEAR = 2026;
export const START_MONTH = 2;
export const WEEKDAY_LABELS: WeekdayJa[] = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];

export function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, date.getDate());
}

export function daysBetween(a: Date, b: Date): number {
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor((b.getTime() - a.getTime()) / oneDay);
}

export function getVisibleDays(baseDate: Date, mode: ViewMode): CalendarDay[] {
  if (mode === 'day') {
    const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    return [{ date, dateKey: formatDateKey(date), inMonth: true, weekdayIndex: date.getDay() }];
  }
  if (mode === 'week') {
    const start = new Date(baseDate);
    start.setDate(baseDate.getDate() - baseDate.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, dateKey: formatDateKey(date), inMonth: true, weekdayIndex: date.getDay() };
    });
  }

  const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      dateKey: formatDateKey(date),
      inMonth: date.getMonth() === baseDate.getMonth(),
      weekdayIndex: date.getDay()
    };
  });
}

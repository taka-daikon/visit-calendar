import { inferSkills } from './skills';
import { RawCsvRow, UserRecord, WeekdayJa } from '../types';

const WEEKDAYS: WeekdayJa[] = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result.map((cell) => cell.trim());
}

export function parseCsv(text: string): UserRecord[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const record = header.reduce<Record<string, string>>((acc, key, cellIndex) => {
      acc[key] = cells[cellIndex] ?? '';
      return acc;
    }, {});
    const raw = record as unknown as RawCsvRow;
    const hopeDays = (raw.希望曜日 || '')
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value): value is WeekdayJa => WEEKDAYS.includes(value as WeekdayJa));

    return {
      ...raw,
      id: `user-${index + 1}`,
      hopeDays,
      希望処置内容: raw.希望処置内容 || '基本看護',
      _skills: inferSkills(raw.希望処置内容 || '基本看護')
    } as UserRecord & { _skills: string[] };
  }).map(({ _skills, ...row }) => row);
}

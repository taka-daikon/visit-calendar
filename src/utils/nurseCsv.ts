import { Nurse, NurseGender, EmploymentType, WeekdayJa } from '../types';

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

function toBool(value: string, fallback = true): boolean {
  const normalized = value.trim();
  if (!normalized) return fallback;
  return ['true', '1', 'yes', '可', '稼働中', '有効', 'on'].includes(normalized);
}

export function parseNurseCsv(text: string): Nurse[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const record = header.reduce<Record<string, string>>((acc, key, cellIndex) => {
      acc[key] = cells[cellIndex] ?? '';
      return acc;
    }, {});

    const workingWeekdays = (record['勤務曜日'] || '')
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value): value is WeekdayJa => WEEKDAYS.includes(value as WeekdayJa));

    const skills = (record['スキル'] || '')
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);

    const areas = (record['エリア'] || '')
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      id: `nurse-${index + 1}`,
      name: record['氏名'] || `看護師${index + 1}`,
      gender: ((record['性別'] || '女性') as NurseGender),
      employmentType: ((record['雇用区分'] || '常勤') as EmploymentType),
      active: toBool(record['稼働'], true),
      maxVisitsPerDay: Number(record['1日上限件数'] || 6),
      workingWeekdays: workingWeekdays.length ? workingWeekdays : ['月曜', '火曜', '水曜', '木曜', '金曜'],
      shiftAvailability: {
        午前: toBool(record['午前可'], true),
        午後: toBool(record['午後可'], true)
      },
      skills: skills.length ? skills : ['基本看護'],
      areas: areas.length ? areas : ['岡山市北区']
    } satisfies Nurse;
  });
}

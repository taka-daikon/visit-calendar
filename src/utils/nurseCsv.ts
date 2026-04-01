import { EmploymentType, Nurse, NurseGender, WeekdayJa } from '../types';

const WEEKDAYS: WeekdayJa[] = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];
const DAY_COLUMNS = Array.from({ length: 31 }, (_, index) => `${index + 1}日`);
const REQUIRED_HEADERS = ['氏名'] as const;

const HEADER_ALIASES: Record<string, string> = {
  '名前': '氏名',
  'スタッフ名': '氏名',
  'ワーカー名': '氏名',
  '看護師名': '氏名',
  '雇用': '雇用区分',
  '上限件数': '1日上限件数',
  '稼働': '稼働',
  '対象月': '対象年月'
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((char === ',' || char === '，') && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current);
  return result.map((cell) => cell.trim());
}

function normalizeHeader(raw: string): string {
  const value = raw.replace(/^\uFEFF/, '').replace(/\s+/g, '').trim();
  const aliased = HEADER_ALIASES[value] ?? value;

  if (/^\d{1,2}日$/.test(aliased)) return aliased;
  if (/^\d{1,2}$/.test(aliased)) return `${aliased}日`;

  const dateMatch = aliased.match(/^(?:(\d{4})[\/\-年])?(\d{1,2})[\/\-月](\d{1,2})日?$/);
  if (dateMatch) {
    return `${Number(dateMatch[3])}日`;
  }

  return aliased;
}

function normalizeMonth(value: string): string {
  const normalized = value.replace(/^\uFEFF/, '').trim();
  if (!normalized) return '';

  const match = normalized.match(/^(\d{4})[\/\-年]\s*(\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
  }

  const monthOnly = normalized.match(/^(\d{1,2})月?$/);
  if (monthOnly) {
    return `${new Date().getFullYear()}-${String(Number(monthOnly[1])).padStart(2, '0')}`;
  }

  return normalized;
}

function inferMonthFromHeaders(rawHeaders: string[]): string {
  for (const header of rawHeaders) {
    const normalized = header.replace(/^\uFEFF/, '').replace(/\s+/g, '').trim();
    const fullMatch = normalized.match(/^(\d{4})[\/\-年]\s*(\d{1,2})[\/\-月]\s*\d{1,2}日?$/);
    if (fullMatch) {
      return `${fullMatch[1]}-${String(Number(fullMatch[2])).padStart(2, '0')}`;
    }

    const monthDay = normalized.match(/^(\d{1,2})[\/\-月]\s*\d{1,2}日?$/);
    if (monthDay) {
      return `${new Date().getFullYear()}-${String(Number(monthDay[1])).padStart(2, '0')}`;
    }
  }
  return '';
}

function toBool(value: string, fallback = true): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return ['true', '1', 'yes', '可', '稼働中', '有効', 'on', '○', '◯', '〇'].includes(normalized);
}

function normalizeGender(value: string): NurseGender {
  return value === '男性' ? '男性' : '女性';
}

function normalizeEmployment(value: string): EmploymentType {
  return value === '非常勤' ? '非常勤' : '常勤';
}

function normalizeAvailabilityValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (['○', '◯', '〇', '可', '勤務可'].includes(trimmed)) return '09:00-18:00';
  return trimmed.replace(/〜/g, '-').replace(/－/g, '-').replace(/―/g, '-').replace(/ー/g, '-');
}

export function parseNurseCsv(text: string): Nurse[] {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('ワーカーCSVの行数が不足しています。ヘッダー行とデータ行を確認してください。');
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const header = rawHeaders.map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((key) => !header.includes(key));
  if (missing.length) {
    throw new Error(`ワーカーCSVの必須列が不足しています: ${missing.join(' / ')}`);
  }

  const inferredMonth = inferMonthFromHeaders(rawHeaders);

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const record = header.reduce<Record<string, string>>((acc, key, cellIndex) => {
      acc[key] = (cells[cellIndex] ?? '').trim();
      return acc;
    }, {});

    const workingWeekdays = (record['勤務曜日'] || '')
      .split(/[|｜、/／,，]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value): value is WeekdayJa => WEEKDAYS.includes(value as WeekdayJa));

    const skills = (record['スキル'] || '')
      .split(/[|｜、/／,，]/)
      .map((value) => value.trim())
      .filter(Boolean);

    const areas = (record['エリア'] || '')
      .split(/[|｜、/／,，]/)
      .map((value) => value.trim())
      .filter(Boolean);

    const monthlyAvailability = DAY_COLUMNS.reduce<Record<string, string>>((acc, column) => {
      const value = normalizeAvailabilityValue(record[column] || '');
      if (value) acc[column] = value;
      return acc;
    }, {});

    return {
      id: `nurse-${index + 1}`,
      name: record['氏名'] || `看護師${index + 1}`,
      gender: normalizeGender(record['性別'] || '女性'),
      employmentType: normalizeEmployment(record['雇用区分'] || '常勤'),
      active: toBool(record['稼働'], true),
      maxVisitsPerDay: Number(record['1日上限件数'] || 6),
      workingWeekdays: workingWeekdays.length ? workingWeekdays : ['月曜', '火曜', '水曜', '木曜', '金曜'],
      shiftAvailability: {
        午前: toBool(record['午前可'], true),
        午後: toBool(record['午後可'], true)
      },
      skills: skills.length ? skills : ['基本看護'],
      areas: areas.length ? areas : ['岡山市北区'],
      monthlyAvailabilityMonth: normalizeMonth(record['対象年月'] || inferredMonth),
      monthlyAvailability
    } satisfies Nurse;
  });
}

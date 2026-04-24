import { RawCsvRow, UserRecord, WeekdayJa } from '../types';

const WEEKDAYS: WeekdayJa[] = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];
const REQUIRED_HEADERS = ['利用者名', '居住地', '保険区分', '希望曜日'] as const;

export const EXCEL_USER_TEMPLATE_HEADERS = [
  '入力者',
  '利用者名',
  '利用者ID',
  'かな',
  '施設名',
  '住所',
  '保険対象',
  '訪問NG日付',
  '訪問NG開始時間',
  '訪問NG終了時間',
  '訪問希望曜日',
  '訪問希望時間帯',
  '女性希望',
  '希望ケア',
  'その他要望',
  '入力日',
  '更新日',
  '利用者確認日',
  '確定の有無',
  '過去履歴訪問NG'
] as const;

const HEADER_ALIASES: Record<string, string> = {
  お名前: '利用者名',
  氏名: '利用者名',
  利用者: '利用者名',
  住所: '居住地',
  エリア: '居住地',
  地域: '居住地',
  保険: '保険区分',
  保険対象: '保険区分',
  '希望曜日（複数可）': '希望曜日',
  曜日: '希望曜日',
  訪問希望曜日: '希望曜日',
  '希望性別（希望なし可）': '希望性別',
  女性希望: '女性希望',
  処置内容: '希望処置内容',
  希望ケア: '希望処置内容',
  その他要望: 'その他要望',
  色: 'カラー',
  boxcolor: 'カラー',
  担当看護師: '担当看護師名',
  希望担当看護師: '担当看護師名',
  訪問希望時間帯: '訪問希望時間帯',
  訪問NG日付: '訪問NG日付',
  訪問NG開始時間: '訪問NG開始時間',
  訪問NG終了時間: '訪問NG終了時間',
  利用者確認日: '利用者確認日',
  過去履歴訪問NG: '過去履歴訪問NG'
};

function normalizeHeader(value: string): string {
  const normalized = value.replace(/^\uFEFF/, '').replace(/[\s\u3000]+/g, '').trim();
  return HEADER_ALIASES[normalized] ?? normalized;
}

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

function normalizeGender(value: string, femalePreference?: string): RawCsvRow['希望性別'] {
  if (value === '男性' || value === '女性') return value;
  if (/^(はい|有|希望|女性|1|true|ok)$/i.test(String(femalePreference ?? '').trim())) return '女性';
  return '希望なし';
}

function normalizeInsurance(value: string): RawCsvRow['保険区分'] {
  const text = String(value ?? '').trim();
  if (text.includes('介護')) return '介護保険';
  return '医療保険';
}

function normalizeWeekdayToken(value: string): WeekdayJa | null {
  const text = String(value ?? '').trim().replace(/曜日/g, '曜');
  if (!text) return null;
  const map: Record<string, WeekdayJa> = {
    日: '日曜',
    日曜: '日曜',
    月: '月曜',
    月曜: '月曜',
    火: '火曜',
    火曜: '火曜',
    水: '水曜',
    水曜: '水曜',
    木: '木曜',
    木曜: '木曜',
    金: '金曜',
    金曜: '金曜',
    土: '土曜',
    土曜: '土曜'
  };
  return map[text] ?? null;
}

function parseHopeDays(value: string): WeekdayJa[] {
  return String(value ?? '')
    .split(/[|｜、/／,，\s]+/)
    .map((item) => normalizeWeekdayToken(item))
    .filter((item): item is WeekdayJa => Boolean(item))
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeTimeValue(value: string): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text
    .replace(/〜|～|–|—|ー|−|~|〜/g, '-')
    .replace(/時/g, ':')
    .replace(/分/g, '')
    .replace(/：/g, ':')
    .replace(/\s+/g, '')
    .replace(/:+/g, ':')
    .replace(/(^|-)24:00/g, '$123:59');
}

function applyCommonTimeRange(record: Record<string, string>, hopeDays: WeekdayJa[]) {
  const commonRange = normalizeTimeValue(record['訪問希望時間帯'] || '');
  if (!commonRange) return;
  const timeFieldMap: Record<WeekdayJa, string> = {
    日曜: '日曜希望時間',
    月曜: '月曜希望時間',
    火曜: '火曜希望時間',
    水曜: '水曜希望時間',
    木曜: '木曜希望時間',
    金曜: '金曜希望時間',
    土曜: '土曜希望時間'
  };
  hopeDays.forEach((weekday) => {
    const field = timeFieldMap[weekday];
    if (!record[field]) record[field] = commonRange;
  });
}

export function parseCsv(text: string): UserRecord[] {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('利用者CSVの行数が不足しています。ヘッダー行とデータ行を確認してください。');
  }

  const header = parseCsvLine(lines[0]).map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((key) => !header.includes(key));
  if (missing.length) {
    throw new Error(`利用者CSVの必須列が不足しています: ${missing.join(' / ')}`);
  }

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const record = header.reduce<Record<string, string>>((acc, key, cellIndex) => {
      acc[key] = (cells[cellIndex] ?? '').trim();
      return acc;
    }, {});

    const hopeDays = parseHopeDays(record['希望曜日'] || record['訪問希望曜日'] || '');
    applyCommonTimeRange(record, hopeDays);
    const address = record['居住地'] || record['住所'] || '岡山市北区奥田1-1-1';
    const insurance = normalizeInsurance(record['保険区分'] || record['保険対象'] || '');
    const treatment = record['希望処置内容'] || record['希望ケア'] || '基本看護';
    const preferredNurseName = record['担当看護師名'] || '';
    const commonTimeRange = normalizeTimeValue(record['訪問希望時間帯'] || '');

    return {
      id: record['利用者ID']?.trim() || `user-${index + 1}`,
      利用者名: record['利用者名'] || `利用者${index + 1}`,
      居住地: address,
      保険区分: insurance,
      更新サイクル: record['更新サイクル'] || '1ヶ月',
      希望曜日: (hopeDays.length ? hopeDays : parseHopeDays(record['希望曜日'] || '')).join('|'),
      希望性別: normalizeGender(record['希望性別'], record['女性希望']),
      希望処置内容: treatment,
      月曜希望時間: normalizeTimeValue(record['月曜希望時間'] || ''),
      火曜希望時間: normalizeTimeValue(record['火曜希望時間'] || ''),
      水曜希望時間: normalizeTimeValue(record['水曜希望時間'] || ''),
      木曜希望時間: normalizeTimeValue(record['木曜希望時間'] || ''),
      金曜希望時間: normalizeTimeValue(record['金曜希望時間'] || ''),
      土曜希望時間: normalizeTimeValue(record['土曜希望時間'] || ''),
      日曜希望時間: normalizeTimeValue(record['日曜希望時間'] || ''),
      前回更新日: record['前回更新日'] || record['利用者確認日'] || '',
      書類期限日: record['書類期限日'] || '',
      カラー: record['カラー'] || '',
      担当看護師名: preferredNurseName,
      boxColor: record['カラー'] || '',
      preferredNurseName,
      hopeDays,
      入力者: record['入力者'] || '',
      利用者ID: record['利用者ID'] || '',
      かな: record['かな'] || '',
      施設名: record['施設名'] || '',
      住所: address,
      保険対象: record['保険対象'] || insurance,
      訪問NG日付: record['訪問NG日付'] || '',
      訪問NG開始時間: normalizeTimeValue(record['訪問NG開始時間'] || ''),
      訪問NG終了時間: normalizeTimeValue(record['訪問NG終了時間'] || ''),
      訪問希望曜日: record['訪問希望曜日'] || record['希望曜日'] || hopeDays.join('|'),
      訪問希望時間帯: commonTimeRange,
      女性希望: record['女性希望'] || (normalizeGender(record['希望性別'], record['女性希望']) === '女性' ? '希望' : ''),
      希望ケア: record['希望ケア'] || treatment,
      その他要望: record['その他要望'] || '',
      入力日: record['入力日'] || '',
      更新日: record['更新日'] || '',
      利用者確認日: record['利用者確認日'] || record['前回更新日'] || '',
      確定の有無: record['確定の有無'] || '',
      過去履歴訪問NG: record['過去履歴訪問NG'] || ''
    } satisfies UserRecord;
  });
}

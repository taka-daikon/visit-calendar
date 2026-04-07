import { RawCsvRow, UserRecord, WeekdayJa } from '../types';

const WEEKDAYS: WeekdayJa[] = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];
const REQUIRED_HEADERS = ['利用者名', '居住地', '保険区分', '更新サイクル', '希望曜日', '希望性別', '希望処置内容'] as const;

const HEADER_ALIASES: Record<string, string> = {
  お名前: '利用者名',
  氏名: '利用者名',
  利用者: '利用者名',
  住所: '居住地',
  エリア: '居住地',
  地域: '居住地',
  保険: '保険区分',
  '希望曜日（複数可）': '希望曜日',
  曜日: '希望曜日',
  '希望性別（希望なし可）': '希望性別',
  処置内容: '希望処置内容',
  色: 'カラー',
  boxcolor: 'カラー',
  担当看護師: '担当看護師名',
  希望担当看護師: '担当看護師名'
};

function normalizeHeader(value: string): string {
  const normalized = value.replace(/^\uFEFF/, '').replace(/\s+/g, '').trim();
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

function normalizeGender(value: string): RawCsvRow['希望性別'] {
  if (value === '男性' || value === '女性') return value;
  return '希望なし';
}

function normalizeInsurance(value: string): RawCsvRow['保険区分'] {
  return value === '介護保険' ? '介護保険' : '医療保険';
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

    const hopeDays = (record['希望曜日'] || '')
      .split(/[|｜、/／,，]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value): value is WeekdayJa => WEEKDAYS.includes(value as WeekdayJa));

    return {
      id: `user-${index + 1}`,
      利用者名: record['利用者名'] || `利用者${index + 1}`,
      居住地: record['居住地'] || '岡山市北区奥田1-1-1',
      保険区分: normalizeInsurance(record['保険区分']),
      更新サイクル: record['更新サイクル'] || '1ヶ月',
      希望曜日: record['希望曜日'] || '',
      希望性別: normalizeGender(record['希望性別']),
      希望処置内容: record['希望処置内容'] || '基本看護',
      月曜希望時間: record['月曜希望時間'] || '',
      火曜希望時間: record['火曜希望時間'] || '',
      水曜希望時間: record['水曜希望時間'] || '',
      木曜希望時間: record['木曜希望時間'] || '',
      金曜希望時間: record['金曜希望時間'] || '',
      土曜希望時間: record['土曜希望時間'] || '',
      日曜希望時間: record['日曜希望時間'] || '',
      前回更新日: record['前回更新日'] || '',
      書類期限日: record['書類期限日'] || '',
      カラー: record['カラー'] || '',
      担当看護師名: record['担当看護師名'] || '',
      boxColor: record['カラー'] || '',
      preferredNurseName: record['担当看護師名'] || '',
      hopeDays
    };
  });
}

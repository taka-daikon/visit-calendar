const SKILL_MAP: Array<{ keyword: string; skill: string }> = [
  { keyword: '褥瘡', skill: '褥瘡処置' },
  { keyword: '点滴', skill: '点滴管理' },
  { keyword: '清潔', skill: '清潔ケア' },
  { keyword: '入浴', skill: '入浴介助' },
  { keyword: 'ストーマ', skill: 'ストーマ管理' },
  { keyword: '認知症', skill: '認知症ケア' },
  { keyword: 'リハビリ', skill: 'リハビリ' },
  { keyword: '服薬', skill: '服薬管理' },
  { keyword: '栄養', skill: '栄養管理' }
];

export function inferSkills(treatment: string): string[] {
  const matched = SKILL_MAP.filter((item) => treatment.includes(item.keyword)).map((item) => item.skill);
  return matched.length ? Array.from(new Set(matched)) : ['基本看護'];
}

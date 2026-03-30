import { Nurse } from '../types';

export const sampleNurses: Nurse[] = [
  {
    id: 'nurse-1',
    name: '井上 由美',
    gender: '女性',
    employmentType: '常勤',
    active: true,
    maxVisitsPerDay: 8,
    workingWeekdays: ['月曜', '火曜', '水曜', '木曜', '金曜'],
    shiftAvailability: { 午前: true, 午後: true },
    skills: ['褥瘡処置', '清潔ケア', 'リハビリ', '服薬管理'],
    areas: ['岡山市北区', '岡山市中区', '岡山市南区']
  },
  {
    id: 'nurse-2',
    name: '松本 恒一',
    gender: '男性',
    employmentType: '常勤',
    active: true,
    maxVisitsPerDay: 8,
    workingWeekdays: ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜'],
    shiftAvailability: { 午前: true, 午後: true },
    skills: ['点滴管理', '褥瘡処置', '服薬管理', '栄養管理'],
    areas: ['岡山市中区', '総社市中央', '岡山市北区']
  },
  {
    id: 'nurse-3',
    name: '山田 葵',
    gender: '女性',
    employmentType: '非常勤',
    active: true,
    maxVisitsPerDay: 5,
    workingWeekdays: ['火曜', '水曜', '木曜', '金曜'],
    shiftAvailability: { 午前: true, 午後: false },
    skills: ['リハビリ', '認知症ケア', '清潔ケア'],
    areas: ['岡山市東区', '岡山市南区', '玉野市築港']
  },
  {
    id: 'nurse-4',
    name: '森田 海斗',
    gender: '男性',
    employmentType: '非常勤',
    active: true,
    maxVisitsPerDay: 6,
    workingWeekdays: ['月曜', '火曜', '木曜', '土曜'],
    shiftAvailability: { 午前: false, 午後: true },
    skills: ['ストーマ管理', '入浴介助', '服薬管理'],
    areas: ['倉敷市阿知', '倉敷市水島', '総社市中央']
  },
  {
    id: 'nurse-5',
    name: '小川 真理',
    gender: '女性',
    employmentType: '常勤',
    active: true,
    maxVisitsPerDay: 7,
    workingWeekdays: ['火曜', '水曜', '金曜', '土曜'],
    shiftAvailability: { 午前: true, 午後: true },
    skills: ['認知症ケア', '清潔ケア', 'ストーマ管理', 'リハビリ'],
    areas: ['玉野市築港', '岡山市南区', '倉敷市水島']
  }
];

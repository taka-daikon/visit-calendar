export type InsuranceType = '医療保険' | '介護保険';
export type GenderPreference = '希望なし' | '男性' | '女性';
export type NurseGender = '男性' | '女性';
export type WorkShift = '午前' | '午後' | '終日';
export type EmploymentType = '常勤' | '非常勤';
export type ViewMode = 'month' | 'week' | 'day';
export type SyncProvider = 'local' | 'firebase' | 'demo';
export type WeekdayJa = '日曜' | '月曜' | '火曜' | '水曜' | '木曜' | '金曜' | '土曜';

export interface RawCsvRow {
  利用者名: string;
  居住地: string;
  保険区分: InsuranceType;
  更新サイクル: string;
  希望曜日: string;
  希望性別: GenderPreference;
  希望処置内容: string;
  月曜希望時間?: string;
  火曜希望時間?: string;
  水曜希望時間?: string;
  木曜希望時間?: string;
  金曜希望時間?: string;
  土曜希望時間?: string;
  日曜希望時間?: string;
  前回更新日?: string;
  書類期限日?: string;
}

export interface UserRecord extends RawCsvRow {
  id: string;
  hopeDays: WeekdayJa[];
}

export interface TimeSlot {
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
}

export interface CandidateVisit extends TimeSlot {
  slotId: string;
  dateKey: string;
  userId: string;
  userName: string;
  area: string;
  insuranceType: InsuranceType;
  updateCycle: string;
  genderPreference: GenderPreference;
  treatment: string;
  requiredSkills: string[];
  weekday: WeekdayJa;
}

export interface ScheduledVisit extends CandidateVisit {
  confirmedAt: string;
  nurseId?: string;
  nurseName?: string;
  memo?: string;
  assignmentScore?: number;
  manuallyEdited?: boolean;
  routeOrder?: number;
  estimatedTravelMinutes?: number;
  estimatedTravelKm?: number;
}

export interface Nurse {
  id: string;
  name: string;
  gender: NurseGender;
  employmentType: EmploymentType;
  active: boolean;
  maxVisitsPerDay: number;
  workingWeekdays: WeekdayJa[];
  shiftAvailability: {
    午前: boolean;
    午後: boolean;
  };
  skills: string[];
  areas: string[];
}

export interface Filters {
  keyword: string;
  area: string;
  insuranceType: '' | InsuranceType;
  nurseGender: '' | NurseGender;
}

export interface CalendarDay {
  date: Date;
  dateKey: string;
  inMonth: boolean;
  weekdayIndex: number;
}

export interface ReviewAlert {
  userId: string;
  userName: string;
  area: string;
  insuranceType: InsuranceType;
  updateCycle: string;
  dueDate: string;
  daysRemaining: number;
  status: 'overdue' | 'warning' | 'normal' | 'needs-base-date';
}

export interface DocumentDeadline {
  userId: string;
  userName: string;
  area: string;
  insuranceType: InsuranceType;
  dueDate: string;
  daysRemaining: number;
  kind: '介護計画書' | '医療指示書' | '報告書';
}

export interface AreaReport {
  area: string;
  candidateCount: number;
  confirmedCount: number;
  utilizationRate: number;
  movementEfficiencyScore: number;
}

export interface MonthlyReport {
  totalConfirmedVisits: number;
  byInsurance: Record<InsuranceType, number>;
  byArea: AreaReport[];
}

export interface ConflictWarning {
  type: 'nurse-overlap' | 'user-duplicate';
  dateKey: string;
  message: string;
  slotIds: string[];
}

export interface RouteSuggestion {
  nurseId: string;
  nurseName: string;
  dateKey: string;
  orderedVisits: ScheduledVisit[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  provider: 'google-maps' | 'fallback' | 'demo';
}

export interface AuthUser {
  uid: string;
  email: string | null;
  role: 'admin' | 'nurse';
  displayName?: string | null;
}

export interface SyncState {
  provider: SyncProvider;
  connected: boolean;
  lastSyncedAt?: string;
  error?: string;
}

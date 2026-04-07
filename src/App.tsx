import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertsPanel } from './components/AlertsPanel';
import { BusinessTabsPanel } from './components/BusinessTabsPanel';
import { CalendarView } from './components/CalendarView';
import { CandidateList } from './components/CandidateList';
import { CloudSyncPanel } from './components/CloudSyncPanel';
import { ConfirmedSchedulePanel } from './components/ConfirmedSchedulePanel';
import { ConflictWarningsPanel } from './components/ConflictWarningsPanel';
import { DocumentsDashboard } from './components/DocumentsDashboard';
import { DraftManagerPanel } from './components/DraftManagerPanel';
import { FiltersPanel } from './components/FiltersPanel';
import { NurseMasterPanel } from './components/NurseMasterPanel';
import { NurseEditorModal } from './components/NurseEditorModal';
import { NurseShiftTabsPanel } from './components/NurseShiftTabsPanel';
import { ReportsPanel } from './components/ReportsPanel';
import { RouteSuggestionPanel } from './components/RouteSuggestionPanel';
import { Toolbar } from './components/Toolbar';
import { UserFormModal } from './components/UserFormModal';
import { sampleCsv } from './data/sampleCsv';
import { sampleNurses } from './data/sampleNurses';
import { currentSyncProvider, isDemoMode } from './services/appEnv';
import { signIn, signOutUser, subscribeAuth } from './services/firebaseAuth';
import { downloadTextFile, loadFromStorage, printHtml, saveToStorage } from './services/persistence';
import { createNurseRepo, createScheduleRepo, createUserRepo } from './services/repository';
import { AuthUser, CandidateVisit, Filters, Nurse, NurseShiftEntry, RouteSuggestion, ScheduledVisit, SyncState, UserRecord, ViewMode, WeekdayJa } from './types';
import { applyFilters, buildCandidateVisits, expandTimeRange, extractAreaName, getAreaColors, getUnscheduledCandidates, groupByDate, minutesToTime, timeToMinutes } from './utils/calendar';
import { parseCsv } from './utils/csv';
import { START_MONTH, START_YEAR, WEEKDAY_LABELS, addMonths, formatDateKey, formatMonthLabel, getVisibleDays } from './utils/date';
import { readCsvFileText } from './utils/fileText';
import { suggestOptimizedRoute } from './utils/mapsRouteService';
import { parseNurseCsv } from './utils/nurseCsv';
import { buildDocumentDeadlines, buildMonthlyReport, buildReviewAlerts, monthlyReportToCsv } from './utils/report';
import { autoAssignNurse, buildConflictWarnings } from './utils/scheduler';
import { inferSkills } from './utils/skills';
import './styles.css';

const today = new Date('2026-03-28T09:00:00');
const defaultFilters: Filters = { keyword: '', area: '', insuranceType: '', nurseGender: '' };
const HIDDEN_CANDIDATE_KEY = 'visit-calendar-hidden-candidates';
const MOVED_CANDIDATE_KEY = 'visit-calendar-moved-candidates';
const CURRENT_DATE_KEY = 'visit-calendar-current-date';
const VIEW_MODE_KEY = 'visit-calendar-view-mode';
const FILTERS_KEY = 'visit-calendar-filters';
const SELECTED_NURSE_KEY = 'visit-calendar-selected-nurse';
const CSV_DRAFT_KEY = 'visit-calendar-csv-draft';
const SCHEDULE_BACKUP_KEY = 'visit-calendar-schedule-backup';
const ROUTE_SUGGESTION_KEY = 'visit-calendar-route-suggestion';
const BUSINESS_STORAGE_KEY = 'visit-calendar-businesses';
const ACTIVE_BUSINESS_KEY = 'visit-calendar-active-business';
const BUSINESS_SNAPSHOT_KEY = 'visit-calendar-business-snapshots';
const SAVED_DRAFTS_KEY = 'visit-calendar-saved-drafts';

const USER_CSV_HEADERS: Array<keyof UserRecord | 'カラー' | '担当看護師名'> = [
  '利用者名',
  '居住地',
  '保険区分',
  '更新サイクル',
  '希望曜日',
  '希望性別',
  '希望処置内容',
  '月曜希望時間',
  '火曜希望時間',
  '水曜希望時間',
  '木曜希望時間',
  '金曜希望時間',
  '土曜希望時間',
  '日曜希望時間',
  '前回更新日',
  '書類期限日',
  'カラー',
  '担当看護師名'
];

const USER_COLOR_OPTIONS = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#fb7185', '#22c55e', '#06b6d4', '#f97316', '#14b8a6', '#fde047', '#94a3b8'];
const USER_WEEKDAYS: WeekdayJa[] = ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜'];
const USER_TIME_FIELD_MAP: Record<WeekdayJa, keyof UserRecord> = {
  日曜: '日曜希望時間',
  月曜: '月曜希望時間',
  火曜: '火曜希望時間',
  水曜: '水曜希望時間',
  木曜: '木曜希望時間',
  金曜: '金曜希望時間',
  土曜: '土曜希望時間'
};

type NurseEditorDraft = Nurse & {
  editDateKey: string;
  shiftId: string;
  shiftStart: string;
  shiftEnd: string;
};

function splitHopeDays(value: string): WeekdayJa[] {
  return value
    .split(/[|｜、/／,，]/)
    .map((item) => item.trim())
    .filter((item): item is WeekdayJa => USER_WEEKDAYS.includes(item as WeekdayJa));
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizeUserRecord(record: UserRecord): UserRecord {
  const hopeDays = splitHopeDays(record.希望曜日 || '').filter((item, index, list) => list.indexOf(item) === index);
  const color = record.boxColor || record.カラー || USER_COLOR_OPTIONS[0];
  const preferredNurseName = record.preferredNurseName || record.担当看護師名 || '';
  return {
    ...record,
    希望曜日: hopeDays.join('|'),
    hopeDays,
    カラー: color,
    boxColor: color,
    preferredNurseName,
    担当看護師名: preferredNurseName
  };
}

function serializeUsersToCsv(records: UserRecord[]): string {
  const lines = records.map((record) => USER_CSV_HEADERS.map((header) => escapeCsvCell(record[header] ?? '')).join(','));
  return [USER_CSV_HEADERS.join(','), ...lines].join('\n');
}

function buildUserDraftForDate(dateKey: string): UserRecord {
  const weekday = weekdayFromDateKey(dateKey);
  const timeField = USER_TIME_FIELD_MAP[weekday];
  return normalizeUserRecord({
    id: crypto.randomUUID(),
    利用者名: '',
    居住地: '',
    保険区分: '医療保険',
    更新サイクル: '1ヶ月',
    希望曜日: weekday,
    希望性別: '希望なし',
    希望処置内容: '基本看護',
    月曜希望時間: '',
    火曜希望時間: '',
    水曜希望時間: '',
    木曜希望時間: '',
    金曜希望時間: '',
    土曜希望時間: '',
    日曜希望時間: '',
    前回更新日: '',
    書類期限日: '',
    カラー: USER_COLOR_OPTIONS[0],
    担当看護師名: '',
    boxColor: USER_COLOR_OPTIONS[0],
    preferredNurseId: '',
    preferredNurseName: '',
    hopeDays: [weekday],
    [timeField]: '09:00-10:00'
  } as UserRecord);
}

const userRepo = createUserRepo();
const nurseRepo = createNurseRepo();
const scheduleRepo = createScheduleRepo();

type CandidateOverrideMap = Record<string, Partial<CandidateVisit>>;

type WorkerAvailabilityItem = {
  shiftId: string;
  nurseId: string;
  nurseName: string;
  dateKey: string;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  fixed: boolean;
  label: string;
  ranges: string[];
};

type BusinessWorkspace = {
  id: string;
  name: string;
  createdAt: string;
};

type BusinessSnapshot = {
  csvText: string;
  users: UserRecord[];
  nurses: Nurse[];
  scheduledVisits: ScheduledVisit[];
  hiddenCandidateIds: string[];
  candidateOverrides: CandidateOverrideMap;
  filters: Filters;
  viewMode: ViewMode;
  currentDateIso: string;
  selectedNurseId: string;
  routeSuggestion: RouteSuggestion | null;
};

type SavedScheduleDraft = BusinessSnapshot & {
  id: string;
  name: string;
  businessId: string;
  businessName: string;
  savedAt: string;
};

const DEFAULT_BUSINESS: BusinessWorkspace = {
  id: 'office-default',
  name: '事業所1',
  createdAt: today.toISOString()
};

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function resolveTargetMonth(sourceNurses: Nurse[], fallback: Date): Date {
  const target = sourceNurses.map((nurse) => nurse.monthlyAvailabilityMonth).find(Boolean);
  const match = target?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthStart(fallback);
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function weekdayFromDateKey(dateKey: string): WeekdayJa {
  const date = new Date(`${dateKey}T00:00:00`);
  return WEEKDAY_LABELS[date.getDay()];
}

function applyCandidateCustomizations(candidates: CandidateVisit[], hiddenIds: string[], overrides: CandidateOverrideMap): CandidateVisit[] {
  const hidden = new Set(hiddenIds);
  return candidates
    .filter((candidate) => !hidden.has(candidate.slotId))
    .map((candidate) => (overrides[candidate.slotId] ? { ...candidate, ...overrides[candidate.slotId] } : candidate));
}

function loadPersistedDate(): Date {
  const raw = loadFromStorage<string | null>(CURRENT_DATE_KEY, null);
  if (!raw) return new Date(START_YEAR, START_MONTH, today.getDate());
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date(START_YEAR, START_MONTH, today.getDate()) : parsed;
}

function resolveMovedVisit(visit: CandidateVisit, targetDateKey: string, nurses: Nurse[]): CandidateVisit {
  const workerAvailability = buildWorkerAvailabilityForDate(nurses, targetDateKey);
  const duration = visit.endMinutes - visit.startMinutes;
  const ranges = workerAvailability
    .map((worker) => ({ start: worker.start, end: worker.end, startMinutes: worker.startMinutes, endMinutes: worker.endMinutes }))
    .filter((item) => Number.isFinite(item.startMinutes) && Number.isFinite(item.endMinutes))
    .sort((a, b) => a.startMinutes - b.startMinutes);

  let nextStart = visit.start;
  let nextEnd = visit.end;
  let nextStartMinutes = visit.startMinutes;
  let nextEndMinutes = visit.endMinutes;

  const fitsExisting = ranges.some((range) => visit.startMinutes >= range.startMinutes && visit.endMinutes <= range.endMinutes);
  if (!fitsExisting && ranges.length > 0) {
    const range = ranges[0];
    nextStartMinutes = range.startMinutes;
    nextEndMinutes = Math.min(range.endMinutes, range.startMinutes + duration);
    if (nextEndMinutes <= nextStartMinutes) {
      nextEndMinutes = range.endMinutes;
    }
    nextStart = minutesToTime(nextStartMinutes);
    nextEnd = minutesToTime(nextEndMinutes);
  }

  return {
    ...visit,
    dateKey: targetDateKey,
    weekday: weekdayFromDateKey(targetDateKey),
    start: nextStart,
    end: nextEnd,
    startMinutes: nextStartMinutes,
    endMinutes: nextEndMinutes
  };
}

function toDayColumn(dateKey: string): string {
  return `${Number(dateKey.slice(8, 10))}日`;
}

function buildShiftId(nurseId: string, dateKey: string, start: string, end: string, index = 0): string {
  return `${nurseId}::${dateKey}::${start}-${end}::${index}`;
}

function parseShiftRanges(raw: string, nurseId: string, dateKey: string): NurseShiftEntry[] {
  return raw
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((range, index) => {
      const [start, end] = range.split('-').map((value) => value.trim());
      const startMinutes = timeToMinutes(start);
      const endMinutes = timeToMinutes(end);
      return {
        id: buildShiftId(nurseId, dateKey, start, end, index),
        dateKey,
        start,
        end,
        startMinutes,
        endMinutes,
        fixed: false,
        deleted: false
      } satisfies NurseShiftEntry;
    })
    .filter((entry) => Number.isFinite(entry.startMinutes) && Number.isFinite(entry.endMinutes) && entry.startMinutes < entry.endMinutes);
}

function resolveEditableShiftEntriesForDate(nurse: Nurse, dateKey: string): NurseShiftEntry[] {
  const explicit = nurse.monthlyShiftDetails?.[dateKey];
  if (explicit) {
    return explicit.map((entry, index) => ({
      ...entry,
      id: entry.id || buildShiftId(nurse.id, dateKey, entry.start, entry.end, index)
    }));
  }

  const monthKey = dateKey.slice(0, 7);
  const monthlyAvailability = nurse.monthlyAvailability ?? {};
  const targetMonth = nurse.monthlyAvailabilityMonth?.trim();
  if (Object.keys(monthlyAvailability).length > 0 && (!targetMonth || targetMonth === monthKey)) {
    const raw = monthlyAvailability[toDayColumn(dateKey)];
    if (raw) return parseShiftRanges(raw, nurse.id, dateKey);
  }

  const weekday = weekdayFromDateKey(dateKey);
  if (!nurse.workingWeekdays.includes(weekday)) return [];
  const ranges: string[] = [];
  if (nurse.shiftAvailability.午前) ranges.push('09:00-12:00');
  if (nurse.shiftAvailability.午後) ranges.push('13:00-18:00');
  return parseShiftRanges(ranges.join('|'), nurse.id, dateKey);
}

function resolveVisibleShiftEntriesForDate(nurse: Nurse, dateKey: string): NurseShiftEntry[] {
  return resolveEditableShiftEntriesForDate(nurse, dateKey).filter((entry) => !entry.deleted);
}

function buildWorkerAvailabilityForDate(nurses: Nurse[], dateKey: string): WorkerAvailabilityItem[] {
  return nurses
    .filter((nurse) => nurse.active)
    .flatMap((nurse) => resolveVisibleShiftEntriesForDate(nurse, dateKey).map((entry) => ({
      shiftId: entry.id,
      nurseId: nurse.id,
      nurseName: nurse.name,
      dateKey,
      start: entry.start,
      end: entry.end,
      startMinutes: entry.startMinutes,
      endMinutes: entry.endMinutes,
      fixed: Boolean(entry.fixed),
      label: `${entry.fixed ? 'FIX ' : ''}${entry.start}-${entry.end}`,
      ranges: [`${entry.start}-${entry.end}`]
    })))
    .sort((a, b) => a.nurseName.localeCompare(b.nurseName, 'ja') || a.startMinutes - b.startMinutes);
}

function normalizeBusinesses(items: BusinessWorkspace[]): BusinessWorkspace[] {
  if (items.length) return items;
  return [DEFAULT_BUSINESS];
}

function buildEmptySnapshot(baseDate = new Date(START_YEAR, START_MONTH, today.getDate())): BusinessSnapshot {
  return {
    csvText: isDemoMode() ? sampleCsv : '',
    users: [],
    nurses: [],
    scheduledVisits: [],
    hiddenCandidateIds: [],
    candidateOverrides: {},
    filters: defaultFilters,
    viewMode: 'month',
    currentDateIso: baseDate.toISOString(),
    selectedNurseId: '',
    routeSuggestion: null
  };
}

function scheduledMapFromVisits(visits: ScheduledVisit[]): Record<string, ScheduledVisit> {
  return visits.reduce<Record<string, ScheduledVisit>>((acc, item) => {
    acc[item.slotId] = item;
    return acc;
  }, {});
}

function scheduleBackupKeyForBusiness(businessId: string): string {
  return `${SCHEDULE_BACKUP_KEY}.${businessId}`;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'draft';
}

export default function App() {
  const initialBusinesses = normalizeBusinesses(loadFromStorage<BusinessWorkspace[]>(BUSINESS_STORAGE_KEY, []));
  const initialActiveBusinessId = loadFromStorage<string>(ACTIVE_BUSINESS_KEY, initialBusinesses[0]?.id ?? DEFAULT_BUSINESS.id);
  const activeBusinessExists = initialBusinesses.some((business) => business.id === initialActiveBusinessId);
  const safeInitialBusinessId = activeBusinessExists ? initialActiveBusinessId : initialBusinesses[0].id;
  const initialSnapshots = loadFromStorage<Record<string, BusinessSnapshot>>(BUSINESS_SNAPSHOT_KEY, {});
  const initialSnapshot = initialSnapshots[safeInitialBusinessId] ?? null;
  const initialDate = initialSnapshot?.currentDateIso ? new Date(initialSnapshot.currentDateIso) : loadPersistedDate();

  const [businesses, setBusinesses] = useState<BusinessWorkspace[]>(initialBusinesses);
  const [activeBusinessId, setActiveBusinessId] = useState(safeInitialBusinessId);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [draftName, setDraftName] = useState('');
  const [savedDrafts, setSavedDrafts] = useState<SavedScheduleDraft[]>(() => loadFromStorage<SavedScheduleDraft[]>(SAVED_DRAFTS_KEY, []));
  const [csvText, setCsvText] = useState(() => initialSnapshot?.csvText ?? (isDemoMode() ? sampleCsv : loadFromStorage(CSV_DRAFT_KEY, '')));
  const [users, setUsers] = useState<UserRecord[]>(() => initialSnapshot?.users ?? []);
  const [nurses, setNurses] = useState<Nurse[]>(() => initialSnapshot?.nurses ?? []);
  const [scheduledMap, setScheduledMap] = useState<Record<string, ScheduledVisit>>(() => scheduledMapFromVisits(initialSnapshot?.scheduledVisits ?? []));
  const [hiddenCandidateIds, setHiddenCandidateIds] = useState<string[]>(() => initialSnapshot?.hiddenCandidateIds ?? loadFromStorage(HIDDEN_CANDIDATE_KEY, []));
  const [candidateOverrides, setCandidateOverrides] = useState<CandidateOverrideMap>(() => initialSnapshot?.candidateOverrides ?? loadFromStorage(MOVED_CANDIDATE_KEY, {}));
  const [filters, setFilters] = useState<Filters>(() => initialSnapshot?.filters ?? loadFromStorage(FILTERS_KEY, defaultFilters));
  const [viewMode, setViewMode] = useState<ViewMode>(() => initialSnapshot?.viewMode ?? loadFromStorage(VIEW_MODE_KEY, 'month'));
  const [currentDate, setCurrentDate] = useState<Date>(() => Number.isNaN(initialDate.getTime()) ? loadPersistedDate() : initialDate);
  const [draggedSlotId, setDraggedSlotId] = useState('');
  const [draggedWorkerShiftId, setDraggedWorkerShiftId] = useState('');
  const [selectedNurseId, setSelectedNurseId] = useState(() => initialSnapshot?.selectedNurseId ?? loadFromStorage(SELECTED_NURSE_KEY, ''));
  const [routeSuggestion, setRouteSuggestion] = useState<RouteSuggestion | null>(() => initialSnapshot?.routeSuggestion ?? loadFromStorage<RouteSuggestion | null>(ROUTE_SUGGESTION_KEY, null));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ provider: currentSyncProvider(), connected: currentSyncProvider() !== 'local' });
  const [interactionVersion, setInteractionVersion] = useState(0);
  const [scheduleHydrated, setScheduleHydrated] = useState(false);
  const [lastReloadAt, setLastReloadAt] = useState('初期表示');
  const [menuOpen, setMenuOpen] = useState(false);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [userFormMode, setUserFormMode] = useState<'create' | 'edit' | null>(null);
  const [userDraft, setUserDraft] = useState<UserRecord | null>(null);
  const [nurseEditorDraft, setNurseEditorDraft] = useState<NurseEditorDraft | null>(null);
  const previousBusinessIdRef = useRef(safeInitialBusinessId);
  const hydratingBusinessRef = useRef(false);

  const scheduledVisits = useMemo(() => Object.values(scheduledMap).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMinutes - b.startMinutes), [scheduledMap]);
  const currentBusinessName = useMemo(() => businesses.find((item) => item.id === activeBusinessId)?.name ?? '事業所', [businesses, activeBusinessId]);
  const scheduleBackupKey = useMemo(() => scheduleBackupKeyForBusiness(activeBusinessId), [activeBusinessId]);
  const businessDrafts = useMemo(() => savedDrafts.filter((draft) => draft.businessId === activeBusinessId), [savedDrafts, activeBusinessId]);
  const selectedNurseLabel = useMemo(() => {
    if (!selectedNurseId) return '全看護師';
    return nurses.find((nurse) => nurse.id === selectedNurseId)?.name ?? '全看護師';
  }, [nurses, selectedNurseId]);

  const showToast = (message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
  };

  const refreshUi = () => {
    setInteractionVersion((prev) => prev + 1);
    setLastReloadAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

  const persistNurseShiftChanges = async (
    nurseId: string,
    updater: (nurse: Nurse, details: Record<string, NurseShiftEntry[]>) => Record<string, NurseShiftEntry[]>
  ) => {
    const target = nurses.find((nurse) => nurse.id === nurseId);
    if (!target) {
      showToast('看護師シフトが見つかりませんでした。', 'error');
      return false;
    }
    const baseDetails = { ...(target.monthlyShiftDetails ?? {}) };
    const nextDetails = updater(target, baseDetails);
    await nurseRepo.upsert({ ...target, monthlyShiftDetails: nextDetails, monthlyAvailabilityMonth: target.monthlyAvailabilityMonth || currentDate.toISOString().slice(0, 7) });
    refreshUi();
    return true;
  };

  const buildBusinessSnapshot = (): BusinessSnapshot => ({
    csvText,
    users,
    nurses,
    scheduledVisits,
    hiddenCandidateIds,
    candidateOverrides,
    filters,
    viewMode,
    currentDateIso: currentDate.toISOString(),
    selectedNurseId,
    routeSuggestion
  });

  const persistSnapshotForBusiness = (businessId: string, snapshot: BusinessSnapshot) => {
    const snapshotMap = loadFromStorage<Record<string, BusinessSnapshot>>(BUSINESS_SNAPSHOT_KEY, {});
    snapshotMap[businessId] = snapshot;
    saveToStorage(BUSINESS_SNAPSHOT_KEY, snapshotMap);
    saveToStorage(scheduleBackupKeyForBusiness(businessId), snapshot.scheduledVisits);
  };

  const hydrateBusinessWorkspace = async (businessId: string, snapshot: BusinessSnapshot) => {
    hydratingBusinessRef.current = true;
    setScheduleHydrated(false);
    setCsvText(snapshot.csvText);
    setUsers(snapshot.users);
    setNurses(snapshot.nurses);
    setScheduledMap(scheduledMapFromVisits(snapshot.scheduledVisits));
    setHiddenCandidateIds(snapshot.hiddenCandidateIds);
    setCandidateOverrides(snapshot.candidateOverrides);
    setFilters(snapshot.filters);
    setViewMode(snapshot.viewMode);
    const nextDate = new Date(snapshot.currentDateIso);
    setCurrentDate(Number.isNaN(nextDate.getTime()) ? new Date(START_YEAR, START_MONTH, today.getDate()) : nextDate);
    setSelectedNurseId(snapshot.selectedNurseId);
    setRouteSuggestion(snapshot.routeSuggestion ?? null);

    await Promise.all([userRepo.clear(), nurseRepo.clear(), scheduleRepo.clear()]);
    await Promise.all(snapshot.users.map((item) => userRepo.upsert(item)));
    await Promise.all(snapshot.nurses.map((item) => nurseRepo.upsert(item)));
    await Promise.all(snapshot.scheduledVisits.map((item) => scheduleRepo.upsert(item)));
    persistSnapshotForBusiness(businessId, snapshot);
    hydratingBusinessRef.current = false;
    setScheduleHydrated(true);
    refreshUi();
  };

  const clearCandidateCustomizations = () => {
    setHiddenCandidateIds([]);
    setCandidateOverrides({});
  };

  const buildCustomizedMonthCandidates = (sourceUsers: UserRecord[], sourceNurses: Nurse[], targetDate: Date) => {
    const monthDays = getVisibleDays(targetDate, 'month').filter((day) => day.inMonth);
    const base = buildCandidateVisits(sourceUsers, monthDays);
    return applyCandidateCustomizations(base, hiddenCandidateIds, candidateOverrides);
  };

  const runAutoAssignment = async (sourceUsers = users, sourceNurses = nurses, baseDate = currentDate) => {
    if (!sourceUsers.length) throw new Error('先に利用者CSVを反映してください。');
    if (!sourceNurses.length) throw new Error('先にワーカーCSVを反映してください。');

    const targetDate = resolveTargetMonth(sourceNurses, baseDate);
    const allCandidates = buildCustomizedMonthCandidates(sourceUsers, sourceNurses, targetDate);
    const assigned: ScheduledVisit[] = [];

    allCandidates.forEach((visit) => {
      const { nurse, score } = autoAssignNurse(visit, sourceNurses, assigned);
      if (!nurse) return;
      assigned.push({
        ...visit,
        confirmedAt: new Date().toISOString(),
        nurseId: nurse.id,
        nurseName: nurse.name,
        assignmentScore: score,
        manuallyEdited: true
      });
    });

    await scheduleRepo.clear();
    await Promise.all(assigned.map((visit) => scheduleRepo.upsert(visit)));
    setCurrentDate(targetDate);
    setViewMode('month');
    setRouteSuggestion(null);
    refreshUi();
    return { assignedCount: assigned.length, candidateCount: allCandidates.length, targetDate };
  };

  const applyCsvText = async (text: string) => {
    const parsed = parseCsv(text);
    if (!parsed.length) throw new Error('利用者CSVにデータがありません。');

    clearCandidateCustomizations();
    setCsvText(text);
    setUsers(parsed);
    await userRepo.clear();
    await Promise.all(parsed.map((user) => userRepo.upsert(user)));

    if (nurses.length) {
      const result = await runAutoAssignment(parsed, nurses, resolveTargetMonth(nurses, currentDate));
      showToast(`利用者CSVを更新しました（${parsed.length}件 / 自動割当 ${result.assignedCount}件）`);
      return;
    }

    await scheduleRepo.clear();
    refreshUi();
    showToast(`利用者CSVを更新しました（${parsed.length}件）`);
  };

  const handleCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readCsvFileText(file);
      await applyCsvText(text);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '利用者CSVの取込に失敗しました。', 'error');
    } finally {
      event.currentTarget.value = '';
    }
  };

  const applyNurseCsvText = async (text: string) => {
    const parsed = parseNurseCsv(text);
    if (!parsed.length) throw new Error('ワーカーCSVにデータがありません。');

    clearCandidateCustomizations();
    const targetDate = resolveTargetMonth(parsed, currentDate);
    setNurses(parsed);
    setCurrentDate(targetDate);
    await nurseRepo.clear();
    await Promise.all(parsed.map((nurse) => nurseRepo.upsert(nurse)));

    if (users.length) {
      const result = await runAutoAssignment(users, parsed, targetDate);
      showToast(`ワーカーCSVを更新しました（${parsed.length}名 / 自動割当 ${result.assignedCount}件）`);
      return;
    }

    await scheduleRepo.clear();
    refreshUi();
    showToast(`ワーカーCSVを更新しました（${parsed.length}名）`);
  };

  const handleNurseCsvFile = async (file: File) => {
    try {
      const text = await readCsvFileText(file);
      await applyNurseCsvText(text);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'ワーカーCSVの取込に失敗しました。', 'error');
    }
  };

  const handleMoveCandidate = (targetDateKey: string, droppedSlotId?: string) => {
    const slotId = droppedSlotId || draggedSlotId;
    if (!slotId) return;
    const visibleDays = getVisibleDays(currentDate, viewMode);
    const effectiveCandidateVisits = applyCandidateCustomizations(buildCandidateVisits(users, visibleDays), hiddenCandidateIds, candidateOverrides);
    const visit = effectiveCandidateVisits.find((item) => item.slotId === slotId);
    if (!visit) return;
    const movedVisit = resolveMovedVisit(visit, targetDateKey, nurses);
    setCandidateOverrides((prev) => ({
      ...prev,
      [slotId]: {
        dateKey: movedVisit.dateKey,
        weekday: movedVisit.weekday,
        start: movedVisit.start,
        end: movedVisit.end,
        startMinutes: movedVisit.startMinutes,
        endMinutes: movedVisit.endMinutes
      }
    }));
    setHiddenCandidateIds((prev) => prev.filter((id) => id !== slotId));
    setDraggedSlotId('');
    refreshUi();
    showToast('候補の日時を更新しました');
  };

  const handleConfirmCandidate = async (slotId: string) => {
    const visibleDays = getVisibleDays(currentDate, viewMode);
    const effectiveCandidateVisits = applyCandidateCustomizations(buildCandidateVisits(users, visibleDays), hiddenCandidateIds, candidateOverrides);
    const visit = effectiveCandidateVisits.find((item) => item.slotId === slotId);
    if (!visit) {
      showToast('候補が見つかりませんでした。', 'error');
      return;
    }

    const { nurse, score } = autoAssignNurse(visit, nurses, scheduledVisits);
    const scheduled: ScheduledVisit = {
      ...visit,
      confirmedAt: new Date().toISOString(),
      nurseId: nurse?.id,
      nurseName: nurse?.name,
      assignmentScore: score,
      manuallyEdited: true
    };

    await scheduleRepo.upsert(scheduled);
    refreshUi();
    showToast(nurse ? `候補を確定しました（${nurse.name}）` : '候補を確定しました（未割当）');
  };

  const handleUpdateCandidateTime = (slotId: string, start: string, end: string) => {
    const visibleDays = getVisibleDays(currentDate, viewMode);
    const effectiveCandidateVisits = applyCandidateCustomizations(buildCandidateVisits(users, visibleDays), hiddenCandidateIds, candidateOverrides);
    const visit = effectiveCandidateVisits.find((item) => item.slotId === slotId);
    if (!visit) {
      showToast('候補が見つかりませんでした。', 'error');
      return;
    }
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    if (!start || !end || Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || startMinutes >= endMinutes) {
      showToast('時間帯を正しく入力してください。', 'error');
      return;
    }
    setCandidateOverrides((prev) => ({
      ...prev,
      [slotId]: {
        ...prev[slotId],
        start,
        end,
        startMinutes,
        endMinutes
      }
    }));
    setHiddenCandidateIds((prev) => prev.filter((id) => id !== slotId));
    refreshUi();
    showToast('候補の時間帯を10分単位で更新しました');
  };

  const handleUpdateScheduledTime = async (slotId: string, start: string, end: string) => {
    const visit = scheduledMap[slotId];
    if (!visit) {
      showToast('確定スケジュールが見つかりませんでした。', 'error');
      return;
    }
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    if (!start || !end || Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || startMinutes >= endMinutes) {
      showToast('時間帯を正しく入力してください。', 'error');
      return;
    }
    await scheduleRepo.upsert({
      ...visit,
      start,
      end,
      startMinutes,
      endMinutes,
      manuallyEdited: true
    });
    refreshUi();
    showToast('確定スケジュールの時間帯を10分単位で更新しました');
  };

  const handleMoveWorkerShift = async (targetDateKey: string, droppedShiftId?: string) => {
    const shiftId = droppedShiftId || draggedWorkerShiftId;
    const shift = workerShiftLookup[shiftId];
    if (!shift) {
      showToast('看護師シフトが見つかりませんでした。', 'error');
      return;
    }

    const success = await persistNurseShiftChanges(shift.nurseId, (nurse, details) => {
      const sourceEntries = resolveEditableShiftEntriesForDate(nurse, shift.dateKey).filter((entry) => entry.id !== shiftId);
      const targetEntries = resolveEditableShiftEntriesForDate(nurse, targetDateKey);
      const movedEntry: NurseShiftEntry = {
        id: crypto.randomUUID(),
        dateKey: targetDateKey,
        start: shift.start,
        end: shift.end,
        startMinutes: shift.startMinutes,
        endMinutes: shift.endMinutes,
        fixed: shift.fixed,
        deleted: false
      };
      return {
        ...details,
        [shift.dateKey]: sourceEntries,
        [targetDateKey]: [...targetEntries.filter((entry) => !entry.deleted), movedEntry].sort((a, b) => a.startMinutes - b.startMinutes)
      };
    });

    if (!success) return;
    setDraggedWorkerShiftId('');
    showToast('看護師シフトを移動しました');
  };

  const handleConfirmWorkerShift = async (shiftId: string) => {
    const shift = workerShiftLookup[shiftId];
    if (!shift) {
      showToast('看護師シフトが見つかりませんでした。', 'error');
      return;
    }

    const success = await persistNurseShiftChanges(shift.nurseId, (nurse, details) => ({
      ...details,
      [shift.dateKey]: resolveEditableShiftEntriesForDate(nurse, shift.dateKey).map((entry) => entry.id === shiftId ? { ...entry, fixed: true, deleted: false } : entry)
    }));

    if (!success) return;
    showToast('看護師シフトを確定しました');
  };

  const handleRemoveWorkerShift = async (shiftId: string) => {
    const shift = workerShiftLookup[shiftId];
    if (!shift) {
      showToast('看護師シフトが見つかりませんでした。', 'error');
      return;
    }

    const success = await persistNurseShiftChanges(shift.nurseId, (nurse, details) => ({
      ...details,
      [shift.dateKey]: resolveEditableShiftEntriesForDate(nurse, shift.dateKey).filter((entry) => entry.id !== shiftId)
    }));

    if (!success) return;
    showToast('看護師シフトを削除しました');
  };

  const handleUpdateWorkerShiftTime = async (shiftId: string, start: string, end: string) => {
    const shift = workerShiftLookup[shiftId];
    if (!shift) {
      showToast('看護師シフトが見つかりませんでした。', 'error');
      return;
    }
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);
    if (!start || !end || Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || startMinutes >= endMinutes) {
      showToast('看護師シフトの時間帯を正しく入力してください。', 'error');
      return;
    }

    const success = await persistNurseShiftChanges(shift.nurseId, (nurse, details) => ({
      ...details,
      [shift.dateKey]: resolveEditableShiftEntriesForDate(nurse, shift.dateKey).map((entry) => entry.id === shiftId ? {
        ...entry,
        start,
        end,
        startMinutes,
        endMinutes,
        deleted: false
      } : entry).sort((a, b) => a.startMinutes - b.startMinutes)
    }));

    if (!success) return;
    showToast('看護師シフトの時間帯を10分単位で更新しました');
  };

  const handleRemoveCandidate = (slotId: string) => {
    setHiddenCandidateIds((prev) => (prev.includes(slotId) ? prev : [...prev, slotId]));
    setCandidateOverrides((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    refreshUi();
    showToast('候補を削除しました');
  };

  const handleRemoveScheduled = async (slotId: string) => {
    await scheduleRepo.remove(slotId);
    refreshUi();
    showToast('確定スケジュールを削除しました');
  };

  const handleUpdateScheduled = async (visit: ScheduledVisit) => {
    await scheduleRepo.upsert({ ...visit, manuallyEdited: true });
    refreshUi();
    showToast('スケジュールを更新しました');
  };

  const handleToggleNurse = async (id: string) => {
    const target = nurses.find((nurse) => nurse.id === id);
    if (!target || authUser?.role === 'nurse') return;
    await nurseRepo.upsert({ ...target, active: !target.active });
    refreshUi();
    showToast('ワーカー情報を更新しました');
  };

  const handleAddNurse = async (nurse: Omit<Nurse, 'id'>) => {
    if (authUser?.role === 'nurse') return;
    await nurseRepo.upsert({ ...nurse, id: crypto.randomUUID() });
    refreshUi();
    showToast('ワーカーを追加しました');
  };


  const closeUserForm = () => {
    setUserFormMode(null);
    setUserDraft(null);
  };

  const handleCreateUserFromDate = (dateKey: string) => {
    setUserFormMode('create');
    setUserDraft(buildUserDraftForDate(dateKey));
  };

  const handleOpenUserEditor = (userId: string) => {
    const target = users.find((item) => item.id === userId);
    if (!target) {
      showToast('利用者情報が見つかりませんでした。', 'error');
      return;
    }
    const matchedNurse = nurses.find((nurse) => nurse.id === target.preferredNurseId || nurse.name === target.preferredNurseName || nurse.name === target.担当看護師名);
    setUserFormMode('edit');
    setUserDraft(normalizeUserRecord({
      ...target,
      preferredNurseId: matchedNurse?.id ?? target.preferredNurseId,
      preferredNurseName: matchedNurse?.name ?? target.preferredNurseName ?? target.担当看護師名 ?? '',
      担当看護師名: matchedNurse?.name ?? target.担当看護師名 ?? target.preferredNurseName ?? ''
    }));
  };

  const handleSaveUser = async () => {
    if (!userDraft) return;
    const normalized = normalizeUserRecord(userDraft);
    if (!normalized.利用者名.trim()) {
      showToast('利用者名を入力してください。', 'error');
      return;
    }
    if (!normalized.居住地.trim()) {
      showToast('居住地を入力してください。', 'error');
      return;
    }

    const exists = users.some((item) => item.id === normalized.id);
    const nextUsers = exists
      ? users.map((item) => item.id === normalized.id ? normalized : item)
      : [...users, normalized].sort((a, b) => a.利用者名.localeCompare(b.利用者名, 'ja'));

    const nextArea = extractAreaName(normalized.居住地);
    const userVisits = scheduledVisits.filter((visit) => visit.userId === normalized.id);
    const scheduleIdsToRemove: string[] = [];
    const updatedSchedules = userVisits.map((visit) => {
      const weekday = weekdayFromDateKey(visit.dateKey);
      const nextRange = expandTimeRange(String(normalized[USER_TIME_FIELD_MAP[weekday]] || '').trim())[0];
      const slotId = nextRange ? `${visit.dateKey}-${normalized.id}-${nextRange.start}-${nextRange.end}` : visit.slotId;
      if (slotId !== visit.slotId) scheduleIdsToRemove.push(visit.slotId);
      return {
        ...visit,
        slotId,
        userName: normalized.利用者名,
        address: normalized.居住地,
        area: nextArea,
        insuranceType: normalized.保険区分,
        updateCycle: normalized.更新サイクル,
        genderPreference: normalized.希望性別,
        treatment: normalized.希望処置内容,
        requiredSkills: inferSkills(normalized.希望処置内容),
        boxColor: normalized.boxColor,
        preferredNurseId: normalized.preferredNurseId,
        preferredNurseName: normalized.preferredNurseName,
        start: nextRange?.start ?? visit.start,
        end: nextRange?.end ?? visit.end,
        startMinutes: nextRange?.startMinutes ?? visit.startMinutes,
        endMinutes: nextRange?.endMinutes ?? visit.endMinutes,
        weekday,
        manuallyEdited: true
      } satisfies ScheduledVisit;
    });

    await userRepo.upsert(normalized);
    if (scheduleIdsToRemove.length) {
      await Promise.all(scheduleIdsToRemove.map((slotId) => scheduleRepo.remove(slotId)));
    }
    if (updatedSchedules.length) {
      await Promise.all(updatedSchedules.map((visit) => scheduleRepo.upsert(visit)));
    }

    setUsers(nextUsers);
    setCsvText(serializeUsersToCsv(nextUsers));
    setHiddenCandidateIds((prev) => prev.filter((slotId) => !slotId.includes(`-${normalized.id}-`)));
    setCandidateOverrides((prev) => Object.fromEntries(Object.entries(prev).filter(([slotId]) => !slotId.includes(`-${normalized.id}-`))));
    setRouteSuggestion(null);
    closeUserForm();
    refreshUi();
    showToast(exists ? '利用者情報を更新しました' : '利用者を登録しました');
  };

  const handleOpenNurseEditor = (nurseId: string, dateKey: string, shiftId: string) => {
    const nurse = nurses.find((item) => item.id === nurseId);
    if (!nurse) {
      showToast('看護師情報が見つかりませんでした。', 'error');
      return;
    }
    const shift = workerShiftLookup[shiftId];
    setNurseEditorDraft({
      ...nurse,
      editDateKey: dateKey,
      shiftId,
      shiftStart: shift?.start ?? '09:00',
      shiftEnd: shift?.end ?? '18:00'
    });
  };

  const handleSaveNurseEditor = async () => {
    if (!nurseEditorDraft) return;
    const original = nurses.find((item) => item.id === nurseEditorDraft.id);
    if (!original) {
      showToast('看護師情報が見つかりませんでした。', 'error');
      return;
    }
    if (!nurseEditorDraft.name.trim()) {
      showToast('看護師名を入力してください。', 'error');
      return;
    }

    const { editDateKey, shiftId, shiftStart, shiftEnd, ...baseNurse } = nurseEditorDraft;
    const startMinutes = timeToMinutes(shiftStart);
    const endMinutes = timeToMinutes(shiftEnd);
    if (!shiftStart || !shiftEnd || Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || startMinutes >= endMinutes) {
      showToast('看護師の勤務時間を正しく入力してください。', 'error');
      return;
    }

    const baseDetails = { ...(original.monthlyShiftDetails ?? {}) };
    const existingEntries = resolveEditableShiftEntriesForDate(original, editDateKey).filter((entry) => entry.id !== shiftId && !entry.deleted);
    const originalEntry = resolveEditableShiftEntriesForDate(original, editDateKey).find((entry) => entry.id === shiftId);
    const nextEntry: NurseShiftEntry = {
      id: shiftId || crypto.randomUUID(),
      dateKey: editDateKey,
      start: shiftStart,
      end: shiftEnd,
      startMinutes,
      endMinutes,
      fixed: originalEntry?.fixed ?? false,
      deleted: false
    };

    const nextNurse: Nurse = {
      ...baseNurse,
      monthlyShiftDetails: {
        ...baseDetails,
        [editDateKey]: [...existingEntries, nextEntry].sort((a, b) => a.startMinutes - b.startMinutes)
      },
      monthlyAvailabilityMonth: baseNurse.monthlyAvailabilityMonth || currentDate.toISOString().slice(0, 7)
    };

    await nurseRepo.upsert(nextNurse);

    const nextUsers = users.map((user) => {
      const matchedById = user.preferredNurseId === nextNurse.id;
      const matchedByName = !user.preferredNurseId && (user.preferredNurseName === original.name || user.担当看護師名 === original.name);
      if (!matchedById && !matchedByName) return user;
      return normalizeUserRecord({
        ...user,
        preferredNurseId: nextNurse.id,
        preferredNurseName: nextNurse.name,
        担当看護師名: nextNurse.name
      });
    });
    const changedUsers = nextUsers.filter((user, index) => user !== users[index]);
    if (changedUsers.length) {
      await Promise.all(changedUsers.map((user) => userRepo.upsert(user)));
      setUsers(nextUsers);
      setCsvText(serializeUsersToCsv(nextUsers));
    }

    const visitsToRefresh = scheduledVisits.filter((visit) => visit.nurseId === nextNurse.id || visit.nurseName === original.name || visit.preferredNurseId === nextNurse.id || visit.preferredNurseName === original.name);
    if (visitsToRefresh.length) {
      await Promise.all(visitsToRefresh.map((visit) => scheduleRepo.upsert({
        ...visit,
        nurseName: visit.nurseId === nextNurse.id ? nextNurse.name : visit.nurseName,
        preferredNurseId: visit.preferredNurseId === nextNurse.id || visit.preferredNurseName === original.name ? nextNurse.id : visit.preferredNurseId,
        preferredNurseName: visit.preferredNurseId === nextNurse.id || visit.preferredNurseName === original.name ? nextNurse.name : visit.preferredNurseName,
        manuallyEdited: true
      })));
    }

    setNurseEditorDraft(null);
    refreshUi();
    showToast('看護師情報を更新しました');
  };

  const handleSuggestRoute = async () => {
    const nurse = nurses.find((item) => item.id === selectedNurseId);
    if (!nurse) {
      showToast('最適訪問ルートを表示するには看護師を選択してください。', 'error');
      return;
    }
    const suggestion = await suggestOptimizedRoute(nurse, formatDateKey(currentDate), scheduledVisits);
    setRouteSuggestion(suggestion);
    if (!suggestion) {
      setRouteModalOpen(false);
      showToast('当日のFIX訪問が不足しているためルート提案を作成できませんでした。', 'error');
      return;
    }
    await Promise.all(suggestion.orderedVisits.map((visit) => scheduleRepo.upsert(visit)));
    setRouteModalOpen(true);
    refreshUi();
    showToast(`最適訪問ルートを更新しました（${suggestion.nurseName}）`);
  };

  const handleExportCsv = () => {
    downloadTextFile(`monthly-report-${currentDate.getFullYear()}-${currentDate.getMonth() + 1}.csv`, monthlyReportToCsv(report), 'text/csv;charset=utf-8');
  };

  const handleExportPdf = () => {
    printHtml('月次レポート', `
      <h1>${formatMonthLabel(currentDate)} 月次レポート</h1>
      <div class="grid">
        <div class="card"><h2>確定訪問件数</h2><p>${report.totalConfirmedVisits}</p></div>
        <div class="card"><h2>保険区分別</h2><p>医療保険: ${report.byInsurance['医療保険']}<br />介護保険: ${report.byInsurance['介護保険']}</p></div>
      </div>
      <table><thead><tr><th>エリア</th><th>候補</th><th>確定</th><th>稼働率</th><th>移動効率</th></tr></thead><tbody>${report.byArea.map((item) => `<tr><td>${item.area}</td><td>${item.candidateCount}</td><td>${item.confirmedCount}</td><td>${item.utilizationRate}%</td><td>${item.movementEfficiencyScore}</td></tr>`).join('')}</tbody></table>
    `);
  };

  const handleSaveDraft = () => {
    const name = draftName.trim() || `${currentBusinessName}-${formatMonthLabel(currentDate)}-下書き`;
    const snapshot = buildBusinessSnapshot();
    const draft: SavedScheduleDraft = {
      id: crypto.randomUUID(),
      name,
      businessId: activeBusinessId,
      businessName: currentBusinessName,
      savedAt: new Date().toISOString(),
      ...snapshot
    };
    setSavedDrafts((prev) => [draft, ...prev]);
    persistSnapshotForBusiness(activeBusinessId, snapshot);
    downloadTextFile(`schedule-draft-${sanitizeFileName(name)}.json`, JSON.stringify(draft, null, 2), 'application/json;charset=utf-8');
    setDraftName('');
    refreshUi();
    showToast(`下書き「${name}」を保存しました`);
  };

  const handleRestoreDraft = async (draftId: string) => {
    const draft = savedDrafts.find((item) => item.id === draftId);
    if (!draft) {
      showToast('復元する下書きが見つかりませんでした。', 'error');
      return;
    }
    const snapshot: BusinessSnapshot = {
      csvText: draft.csvText,
      users: draft.users,
      nurses: draft.nurses,
      scheduledVisits: draft.scheduledVisits,
      hiddenCandidateIds: draft.hiddenCandidateIds,
      candidateOverrides: draft.candidateOverrides,
      filters: draft.filters,
      viewMode: draft.viewMode,
      currentDateIso: draft.currentDateIso,
      selectedNurseId: draft.selectedNurseId,
      routeSuggestion: draft.routeSuggestion
    };
    if (!businesses.some((business) => business.id === draft.businessId)) {
      setBusinesses((prev) => [...prev, { id: draft.businessId, name: draft.businessName, createdAt: draft.savedAt }]);
    }
    persistSnapshotForBusiness(draft.businessId, snapshot);
    setActiveBusinessId(draft.businessId);
    await hydrateBusinessWorkspace(draft.businessId, snapshot);
    showToast(`下書き「${draft.name}」を復元しました`);
  };

  const handleDeleteDraft = (draftId: string) => {
    setSavedDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
    refreshUi();
    showToast('下書きを削除しました');
  };

  const handleAddBusiness = async () => {
    const name = newBusinessName.trim();
    if (!name) {
      showToast('事業所名を入力してください。', 'error');
      return;
    }
    if (businesses.some((business) => business.name === name)) {
      showToast('同じ名前の事業所はすでに登録されています。', 'error');
      return;
    }
    persistSnapshotForBusiness(activeBusinessId, buildBusinessSnapshot());
    const nextBusiness: BusinessWorkspace = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString()
    };
    setBusinesses((prev) => [...prev, nextBusiness]);
    persistSnapshotForBusiness(nextBusiness.id, buildEmptySnapshot(new Date(START_YEAR, START_MONTH, today.getDate())));
    setNewBusinessName('');
    setActiveBusinessId(nextBusiness.id);
    await hydrateBusinessWorkspace(nextBusiness.id, buildEmptySnapshot(new Date(START_YEAR, START_MONTH, today.getDate())));
    showToast(`事業所「${name}」を追加しました`);
  };

  const handleSwitchBusiness = async (businessId: string) => {
    if (businessId === activeBusinessId) return;
    persistSnapshotForBusiness(activeBusinessId, buildBusinessSnapshot());
    const snapshotMap = loadFromStorage<Record<string, BusinessSnapshot>>(BUSINESS_SNAPSHOT_KEY, {});
    const nextSnapshot = snapshotMap[businessId] ?? buildEmptySnapshot(new Date(START_YEAR, START_MONTH, today.getDate()));
    setActiveBusinessId(businessId);
    await hydrateBusinessWorkspace(businessId, nextSnapshot);
    showToast('事業所を切り替えました');
  };

  const handleSignIn = async () => {
    try {
      const user = await signIn(email, password);
      setAuthUser(user);
      setSyncState((prev) => ({ ...prev, connected: true, error: undefined }));
    } catch (error) {
      setSyncState((prev) => ({ ...prev, error: error instanceof Error ? error.message : 'サインインに失敗しました。' }));
    }
  };

  const handleSignOut = async () => {
    persistSnapshotForBusiness(activeBusinessId, buildBusinessSnapshot());
    await signOutUser();
    setAuthUser(null);
  };

  const handleClearUsersCsv = async () => {
    clearCandidateCustomizations();
    await Promise.all([userRepo.clear(), scheduleRepo.clear()]);
    setCsvText('');
    setUsers([]);
    setRouteSuggestion(null);
    saveToStorage(scheduleBackupKey, []);
    refreshUi();
    showToast('利用者CSVを削除しました');
  };

  const handleClearNurseCsv = async () => {
    clearCandidateCustomizations();
    await Promise.all([nurseRepo.clear(), scheduleRepo.clear()]);
    setNurses([]);
    setSelectedNurseId('');
    setRouteSuggestion(null);
    saveToStorage(scheduleBackupKey, []);
    refreshUi();
    showToast('ワーカーCSVを削除しました');
  };

  const handleAutoAssignClick = async () => {
    try {
      const result = await runAutoAssignment();
      showToast(`最適割当を更新しました（${result.assignedCount}/${result.candidateCount}件）`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '最適割当に失敗しました。', 'error');
    }
  };

  const navigate = (delta: number) => {
    if (viewMode === 'day') {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + delta);
      setCurrentDate(next);
      refreshUi();
      return;
    }
    if (viewMode === 'week') {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + delta * 7);
      setCurrentDate(next);
      refreshUi();
      return;
    }
    setCurrentDate(addMonths(currentDate, delta));
    refreshUi();
  };

  useEffect(() => subscribeAuth(setAuthUser), []);
  useEffect(() => saveToStorage(BUSINESS_STORAGE_KEY, businesses), [businesses]);
  useEffect(() => saveToStorage(ACTIVE_BUSINESS_KEY, activeBusinessId), [activeBusinessId]);
  useEffect(() => saveToStorage(SAVED_DRAFTS_KEY, savedDrafts), [savedDrafts]);
  useEffect(() => saveToStorage(HIDDEN_CANDIDATE_KEY, hiddenCandidateIds), [hiddenCandidateIds]);
  useEffect(() => saveToStorage(MOVED_CANDIDATE_KEY, candidateOverrides), [candidateOverrides]);
  useEffect(() => saveToStorage(FILTERS_KEY, filters), [filters]);
  useEffect(() => saveToStorage(VIEW_MODE_KEY, viewMode), [viewMode]);
  useEffect(() => saveToStorage(CURRENT_DATE_KEY, currentDate.toISOString()), [currentDate]);
  useEffect(() => saveToStorage(SELECTED_NURSE_KEY, selectedNurseId), [selectedNurseId]);
  useEffect(() => saveToStorage(CSV_DRAFT_KEY, csvText), [csvText]);
  useEffect(() => saveToStorage(ROUTE_SUGGESTION_KEY, routeSuggestion), [routeSuggestion]);

  useEffect(() => {
    if (hydratingBusinessRef.current) return;
    persistSnapshotForBusiness(activeBusinessId, buildBusinessSnapshot());
  }, [activeBusinessId, csvText, users, nurses, scheduledVisits, hiddenCandidateIds, candidateOverrides, filters, viewMode, currentDate, selectedNurseId, routeSuggestion]);

  useEffect(() => {
    if (!scheduleHydrated || hydratingBusinessRef.current) return;
    saveToStorage(scheduleBackupKey, scheduledVisits);
  }, [scheduleHydrated, scheduleBackupKey, scheduledVisits]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const unsubUsers = userRepo.subscribe((items) => {
      setUsers(items);
    });
    const unsubNurses = nurseRepo.subscribe((items) => {
      setNurses(items);
    });
    const unsubSchedules = scheduleRepo.subscribe((items) => {
      setScheduledMap(scheduledMapFromVisits(items));
      setScheduleHydrated(true);
      setSyncState((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
    });
    return () => {
      unsubUsers();
      unsubNurses();
      unsubSchedules();
    };
  }, []);

  useEffect(() => {
    previousBusinessIdRef.current = activeBusinessId;
  }, [activeBusinessId]);

  useEffect(() => {
    if (!authUser || !isDemoMode()) return;
    if (!users.length) {
      const parsed = parseCsv(sampleCsv);
      setUsers(parsed);
      parsed.forEach((item) => {
        userRepo.upsert(item);
      });
    }
    if (!nurses.length) {
      setNurses(sampleNurses);
      sampleNurses.forEach((item) => {
        nurseRepo.upsert(item);
      });
    }
  }, [authUser, users.length, nurses.length]);

  useEffect(() => {
    if (!authUser || !scheduleHydrated || hydratingBusinessRef.current) return;
    if (Object.keys(scheduledMap).length > 0) return;
    const backup = loadFromStorage<ScheduledVisit[]>(scheduleBackupKey, []);
    if (!backup.length) return;
    Promise.all(backup.map((visit) => scheduleRepo.upsert(visit))).catch(() => undefined);
  }, [authUser, scheduleHydrated, scheduledMap, scheduleBackupKey]);

  const visibleDays = useMemo(() => getVisibleDays(currentDate, viewMode), [currentDate, viewMode]);
  const areaList = useMemo(() => Array.from(new Set(users.map((user) => extractAreaName(user.居住地)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ja')), [users]);
  const areaColors = useMemo(() => getAreaColors(areaList), [areaList]);
  const baseCandidateVisits = useMemo(() => buildCandidateVisits(users, visibleDays), [users, visibleDays]);
  const effectiveCandidateVisits = useMemo(
    () => applyCandidateCustomizations(baseCandidateVisits, hiddenCandidateIds, candidateOverrides),
    [baseCandidateVisits, hiddenCandidateIds, candidateOverrides]
  );
  const filteredCandidates = useMemo(() => applyFilters(effectiveCandidateVisits, filters), [effectiveCandidateVisits, filters]);
  const unscheduledCandidates = useMemo(() => getUnscheduledCandidates(filteredCandidates, scheduledMap), [filteredCandidates, scheduledMap]);
  const candidatesByDate = useMemo(() => groupByDate(unscheduledCandidates), [unscheduledCandidates]);
  const visibleScheduledVisits = useMemo(
    () => selectedNurseId ? scheduledVisits.filter((visit) => visit.nurseId === selectedNurseId) : scheduledVisits,
    [scheduledVisits, selectedNurseId]
  );
  const scheduledByDate = useMemo(() => groupByDate(visibleScheduledVisits), [visibleScheduledVisits]);
  const allWorkerAvailabilityByDate = useMemo(
    () => visibleDays.reduce<Record<string, WorkerAvailabilityItem[]>>((acc, day) => {
      acc[day.dateKey] = buildWorkerAvailabilityForDate(nurses, day.dateKey);
      return acc;
    }, {}),
    [visibleDays, nurses]
  );
  const workerAvailabilityByDate = useMemo(
    () => Object.entries(allWorkerAvailabilityByDate).reduce<Record<string, WorkerAvailabilityItem[]>>((acc, [dateKey, items]) => {
      acc[dateKey] = selectedNurseId ? items.filter((item) => item.nurseId === selectedNurseId) : items;
      return acc;
    }, {}),
    [allWorkerAvailabilityByDate, selectedNurseId]
  );
  const workerShiftLookup = useMemo(
    () => Object.values(allWorkerAvailabilityByDate).flat().reduce<Record<string, WorkerAvailabilityItem>>((acc, item) => {
      acc[item.shiftId] = item;
      return acc;
    }, {}),
    [allWorkerAvailabilityByDate]
  );
  const alerts = useMemo(() => buildReviewAlerts(users, today), [users]);
  const documents = useMemo(() => buildDocumentDeadlines(users, today), [users]);
  const warnings = useMemo(() => buildConflictWarnings(scheduledVisits), [scheduledVisits]);
  const routeKmByArea = useMemo(() => scheduledVisits.reduce<Record<string, number>>((acc, visit) => {
    acc[visit.area] = (acc[visit.area] ?? 0) + (visit.estimatedTravelKm ?? 0);
    return acc;
  }, {}), [scheduledVisits]);
  const report = useMemo(() => buildMonthlyReport(effectiveCandidateVisits, scheduledVisits, routeKmByArea), [effectiveCandidateVisits, scheduledVisits, routeKmByArea]);

  const scheduledCountByUserId = useMemo(() => scheduledVisits.reduce<Record<string, number>>((acc, visit) => {
    acc[visit.userId] = (acc[visit.userId] ?? 0) + 1;
    return acc;
  }, {}), [scheduledVisits]);

  const unassignedAlertRows = useMemo(() => Object.entries(candidatesByDate)
    .filter(([, visits]) => visits.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 6)
    .map(([dateKey, visits]) => ({
      dateKey,
      count: visits.length,
      users: visits.slice(0, 3).map((visit) => visit.userName)
    })), [candidatesByDate]);

  if (!authUser) {
    return (
      <div className="login-shell">
        <section className="login-card card panel">
          <h1>訪問看護スケジューラ</h1>
          <p className="login-lead">利用を開始するには、発行済みのメールアドレスとパスワードでログインしてください。</p>
          <CloudSyncPanel
            authUser={authUser}
            syncState={syncState}
            email={email}
            password={password}
            onChangeEmail={setEmail}
            onChangePassword={setPassword}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {toast && <div className={`toast toast-${toast.tone}`}>{toast.message}</div>}
      <Toolbar
        periodLabel={formatMonthLabel(currentDate)}
        reloadLabel={lastReloadAt}
        businessName={currentBusinessName}
        selectedNurseName={selectedNurseLabel}
        authRole={authUser.role}
        viewMode={viewMode}
        unassignedCount={unscheduledCandidates.length}
        menuOpen={menuOpen}
        onChangeViewMode={(mode) => {
          setViewMode(mode);
          refreshUi();
        }}
        onPrev={() => navigate(-1)}
        onNext={() => navigate(1)}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        onAutoAssign={handleAutoAssignClick}
        onOpenRouteModal={() => {
          handleSuggestRoute().catch((error) => showToast(error instanceof Error ? error.message : '最適訪問ルート提案に失敗しました。', 'error'));
        }}
        onToggleMenu={() => setMenuOpen((prev) => !prev)}
      />

      {menuOpen && (
        <section className="hamburger-drawer card panel">
          <div className="drawer-header split-line">
            <div>
              <h2>補助情報メニュー</h2>
              <p className="helper-text">同期状態、期限アラート、月次情報はここにまとめています。</p>
            </div>
            <button onClick={() => setMenuOpen(false)}>閉じる</button>
          </div>
          <div className="drawer-grid">
            <CloudSyncPanel
              authUser={authUser}
              syncState={syncState}
              email={email}
              password={password}
              onChangeEmail={setEmail}
              onChangePassword={setPassword}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
            />
            <AlertsPanel alerts={alerts} />
            <DocumentsDashboard items={documents} />
            <ReportsPanel report={report} />
            <ConflictWarningsPanel warnings={warnings} />
          </div>
        </section>
      )}

      {routeModalOpen && routeSuggestion && (
        <div className="modal-backdrop" onClick={() => setRouteModalOpen(false)}>
          <div className="modal-card route-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header split-line">
              <div>
                <h2>最適訪問ルート提案</h2>
                <p className="helper-text">エリア距離と希望時間帯をもとに並び替えた訪問順です。現在日は {routeSuggestion.dateKey}、担当は {routeSuggestion.nurseName} です。</p>
              </div>
              <button onClick={() => setRouteModalOpen(false)}>閉じる</button>
            </div>
            <RouteSuggestionPanel
              nurses={nurses}
              selectedNurseId={selectedNurseId}
              onSelectNurseId={(value) => {
                setSelectedNurseId(value);
                setRouteSuggestion(null);
                setRouteModalOpen(false);
                refreshUi();
              }}
              route={routeSuggestion}
              onSuggest={() => {
                handleSuggestRoute().catch((error) => showToast(error instanceof Error ? error.message : '最適訪問ルート提案に失敗しました。', 'error'));
              }}
            />
          </div>
        </div>
      )}


      {userFormMode && userDraft && (
        <UserFormModal
          title={userFormMode === 'create' ? '新規利用者登録' : '利用者BOX編集'}
          draft={userDraft}
          nurses={nurses}
          colorOptions={USER_COLOR_OPTIONS}
          onChange={setUserDraft}
          onClose={closeUserForm}
          onSave={() => {
            handleSaveUser().catch((error) => showToast(error instanceof Error ? error.message : '利用者情報の保存に失敗しました。', 'error'));
          }}
        />
      )}

      {nurseEditorDraft && (
        <NurseEditorModal
          draft={nurseEditorDraft}
          onChange={(draft) => setNurseEditorDraft({ ...draft, shiftId: nurseEditorDraft.shiftId })}
          onClose={() => setNurseEditorDraft(null)}
          onSave={() => {
            handleSaveNurseEditor().catch((error) => showToast(error instanceof Error ? error.message : '看護師情報の保存に失敗しました。', 'error'));
          }}
        />
      )}

      <section className="board-tabs-grid">
        <BusinessTabsPanel
          businesses={businesses}
          activeBusinessId={activeBusinessId}
          newBusinessName={newBusinessName}
          onChangeNewBusinessName={setNewBusinessName}
          onAddBusiness={() => { handleAddBusiness().catch((error) => showToast(error instanceof Error ? error.message : '事業所追加に失敗しました。', 'error')); }}
          onSwitchBusiness={(businessId) => {
            setMenuOpen(false);
            setRouteModalOpen(false);
            handleSwitchBusiness(businessId).catch((error) => showToast(error instanceof Error ? error.message : '事業所切替に失敗しました。', 'error'));
          }}
        />

        <NurseShiftTabsPanel
          nurses={nurses}
          selectedNurseId={selectedNurseId}
          onSelectNurseId={(value) => {
            setSelectedNurseId(value);
            setRouteSuggestion(null);
            setRouteModalOpen(false);
            refreshUi();
          }}
        />

        <DraftManagerPanel
          draftName={draftName}
          onChangeDraftName={setDraftName}
          onSaveDraft={handleSaveDraft}
          drafts={businessDrafts}
          onRestoreDraft={(draftId) => {
            setRouteModalOpen(false);
            handleRestoreDraft(draftId).catch((error) => showToast(error instanceof Error ? error.message : '下書き復元に失敗しました。', 'error'));
          }}
          onDeleteDraft={handleDeleteDraft}
        />
      </section>

      <section className="scheduler-top-row">
        <section className="stats-grid board-summary-grid">
          <article className="stat-card"><span>利用者数</span><strong>{users.length}</strong></article>
          <article className="stat-card"><span>未割当候補</span><strong>{unscheduledCandidates.length}</strong></article>
          <article className="stat-card"><span>FIX訪問</span><strong>{scheduledVisits.length}</strong></article>
          <article className="stat-card"><span>表示中FIX</span><strong>{visibleScheduledVisits.length}</strong></article>
          <article className="stat-card"><span>看護師数</span><strong>{nurses.length}</strong></article>
          <article className="stat-card"><span>重複警告</span><strong>{warnings.length}</strong></article>
        </section>
        <div className="top-right-filter-wrap">
          <FiltersPanel filters={filters} areas={areaList} onChange={(next) => {
            setFilters(next);
            refreshUi();
          }} />
        </div>
      </section>

      {unscheduledCandidates.length > 0 && (
        <section className="card panel unassigned-alert-panel">
          <div className="split-line unassigned-alert-header">
            <div>
              <h2>未割当候補アラート</h2>
              <p className="helper-text">未確定候補が残っています。看護師シフトに合わせてドラッグし、○でFIX化してください。</p>
            </div>
            <div className="alert-count-badge">{unscheduledCandidates.length}件</div>
          </div>
          <div className="unassigned-alert-list">
            {unassignedAlertRows.map((row) => (
              <article key={row.dateKey} className="mini-card unassigned-alert-card">
                <strong>{row.dateKey}</strong>
                <div>{row.count}件未割当</div>
                <div className="card-subtext">{row.users.join(' / ')}{row.count > row.users.length ? ' …' : ''}</div>
              </article>
            ))}
          </div>
        </section>
      )}

      <main className="scheduler-main">
        <CalendarView
          key={`calendar-${interactionVersion}-${formatDateKey(currentDate)}-${viewMode}-${activeBusinessId}`}
          days={visibleDays}
          candidatesByDate={candidatesByDate}
          scheduledByDate={scheduledByDate}
          workerAvailabilityByDate={workerAvailabilityByDate}
          areaColors={areaColors}
          onDragStart={setDraggedSlotId}
          onDragStartWorkerShift={setDraggedWorkerShiftId}
          onDropCandidate={handleMoveCandidate}
          onDropWorkerShift={(dateKey, shiftId) => { handleMoveWorkerShift(dateKey, shiftId).catch((error) => showToast(error instanceof Error ? error.message : '看護師シフト移動に失敗しました。', 'error')); }}
          onConfirmCandidate={handleConfirmCandidate}
          onRemoveCandidate={handleRemoveCandidate}
          onRemoveScheduled={handleRemoveScheduled}
          onConfirmWorkerShift={(shiftId) => { handleConfirmWorkerShift(shiftId).catch((error) => showToast(error instanceof Error ? error.message : '看護師シフト確定に失敗しました。', 'error')); }}
          onRemoveWorkerShift={(shiftId) => { handleRemoveWorkerShift(shiftId).catch((error) => showToast(error instanceof Error ? error.message : '看護師シフト削除に失敗しました。', 'error')); }}
          onUpdateCandidateTime={handleUpdateCandidateTime}
          onUpdateScheduledTime={handleUpdateScheduledTime}
          onUpdateWorkerShiftTime={(shiftId, start, end) => { handleUpdateWorkerShiftTime(shiftId, start, end).catch((error) => showToast(error instanceof Error ? error.message : '看護師シフト時間更新に失敗しました。', 'error')); }}
          onCreateUserFromDate={handleCreateUserFromDate}
          onOpenUserEditor={handleOpenUserEditor}
          onOpenNurseEditor={handleOpenNurseEditor}
          viewMode={viewMode}
          periodLabel={formatMonthLabel(currentDate)}
          selectedNurseName={selectedNurseLabel}
        />
      </main>


      {unscheduledCandidates.length > 0 && (
        <CandidateList visits={unscheduledCandidates} areaColors={areaColors} onDragStart={setDraggedSlotId} />
      )}

      <section className="scheduler-footer-grid">
        <section className="card panel csv-panel footer-panel">
          <h2>CSV取込</h2>
          <p className="helper-text">利用者CSVと看護師CSV、初期登録や更新作業はフッターへ集約しました。</p>
          <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8} />
          <div className="toolbar-actions left csv-actions-wrap">
            <button className="primary" onClick={() => applyCsvText(csvText).catch((error) => showToast(error instanceof Error ? error.message : '利用者CSVの反映に失敗しました。', 'error'))}>利用者CSV反映</button>
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
            <button onClick={handleClearUsersCsv}>利用者CSV削除</button>
          </div>
          <div className="toolbar-actions left csv-actions-wrap nurse-csv-row">
            <input type="file" accept=".csv,text/csv" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              handleNurseCsvFile(file).catch((error) => showToast(error instanceof Error ? error.message : '看護師CSVの反映に失敗しました。', 'error'));
              event.currentTarget.value = '';
            }} />
            <button onClick={handleClearNurseCsv}>看護師CSV削除</button>
          </div>
        </section>

        <section className="card panel footer-users-panel">
          <div className="split-line">
            <div>
              <h2>利用者一覧</h2>
              <p className="helper-text">担当件数とエリアを確認しながら、カレンダー操作へ戻れます。</p>
            </div>
            <span className="badge footer-badge">{users.length}名</span>
          </div>
          <div className="compact-list scrollable-list footer-list">
            {users.length === 0 && <p className="empty">利用者はまだ読み込まれていません。</p>}
            {users.map((user) => (
              <article key={user.id} className="mini-card footer-user-card clickable-card" onClick={() => handleOpenUserEditor(user.id)}>
                <div className="split-line">
                  <strong>{user.利用者名}</strong>
                  <span className="badge footer-badge subtle">FIX {scheduledCountByUserId[user.id] ?? 0}</span>
                </div>
                <div>{user.居住地}</div>
                <div className="card-subtext">{user.保険区分} / 希望: {user.希望曜日 || '未設定'} / 処置: {user.希望処置内容}</div>
              </article>
            ))}
          </div>
        </section>

        <NurseMasterPanel nurses={nurses} onToggleActive={handleToggleNurse} onAdd={handleAddNurse} onImportCsv={handleNurseCsvFile} onClearCsv={handleClearNurseCsv} />

        <ConfirmedSchedulePanel key={`confirmed-list-${interactionVersion}`} visits={visibleScheduledVisits} nurses={nurses} onUpdate={handleUpdateScheduled} onRemove={handleRemoveScheduled} />
      </section>
    </div>
  );
}

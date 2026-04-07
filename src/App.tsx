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
import { ReportsPanel } from './components/ReportsPanel';
import { RouteSuggestionPanel } from './components/RouteSuggestionPanel';
import { Toolbar } from './components/Toolbar';
import { sampleCsv } from './data/sampleCsv';
import { sampleNurses } from './data/sampleNurses';
import { currentSyncProvider, isDemoMode } from './services/appEnv';
import { signIn, signOutUser, subscribeAuth } from './services/firebaseAuth';
import { downloadTextFile, loadFromStorage, printHtml, saveToStorage } from './services/persistence';
import { createNurseRepo, createScheduleRepo, createUserRepo } from './services/repository';
import { AuthUser, CandidateVisit, Filters, Nurse, RouteSuggestion, ScheduledVisit, SyncState, UserRecord, ViewMode, WeekdayJa } from './types';
import { applyFilters, buildCandidateVisits, extractAreaName, getAreaColors, getUnscheduledCandidates, groupByDate, minutesToTime, timeToMinutes } from './utils/calendar';
import { parseCsv } from './utils/csv';
import { START_MONTH, START_YEAR, WEEKDAY_LABELS, addMonths, formatDateKey, formatMonthLabel, getVisibleDays } from './utils/date';
import { readCsvFileText } from './utils/fileText';
import { suggestOptimizedRoute } from './utils/mapsRouteService';
import { parseNurseCsv } from './utils/nurseCsv';
import { buildDocumentDeadlines, buildMonthlyReport, buildReviewAlerts, monthlyReportToCsv } from './utils/report';
import { autoAssignNurse, buildConflictWarnings } from './utils/scheduler';
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

const userRepo = createUserRepo();
const nurseRepo = createNurseRepo();
const scheduleRepo = createScheduleRepo();

type CandidateOverrideMap = Record<string, Partial<CandidateVisit>>;

type WorkerAvailabilityItem = {
  nurseId: string;
  nurseName: string;
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

function buildWorkerAvailabilityForDate(nurses: Nurse[], dateKey: string): WorkerAvailabilityItem[] {
  const visitMonth = dateKey.slice(0, 7);
  const dayColumn = `${Number(dateKey.slice(8, 10))}日`;
  const weekday = weekdayFromDateKey(dateKey);

  return nurses
    .filter((nurse) => nurse.active)
    .flatMap((nurse) => {
      const monthlyAvailability = nurse.monthlyAvailability ?? {};
      const hasMonthly = Object.keys(monthlyAvailability).length > 0;
      const targetMonth = nurse.monthlyAvailabilityMonth?.trim();

      if (hasMonthly && (!targetMonth || targetMonth === visitMonth)) {
        const raw = monthlyAvailability[dayColumn];
        if (!raw) return [];
        const ranges = raw.split('|').map((item) => item.trim()).filter(Boolean);
        if (!ranges.length) return [];
        return [{ nurseId: nurse.id, nurseName: nurse.name, label: ranges.join(' / '), ranges }];
      }

      if (!nurse.workingWeekdays.includes(weekday)) return [];
      const ranges: string[] = [];
      if (nurse.shiftAvailability.午前) ranges.push('09:00-12:00');
      if (nurse.shiftAvailability.午後) ranges.push('13:00-18:00');
      if (!ranges.length) return [];
      return [{ nurseId: nurse.id, nurseName: nurse.name, label: ranges.join(' / '), ranges }];
    })
    .sort((a, b) => a.nurseName.localeCompare(b.nurseName, 'ja'));
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
    .flatMap((worker) => worker.ranges)
    .map((range) => {
      const [start, end] = range.split('-').map((value) => value.trim());
      return { start, end, startMinutes: timeToMinutes(start), endMinutes: timeToMinutes(end) };
    })
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
  const previousBusinessIdRef = useRef(safeInitialBusinessId);
  const hydratingBusinessRef = useRef(false);

  const scheduledVisits = useMemo(() => Object.values(scheduledMap).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMinutes - b.startMinutes), [scheduledMap]);
  const currentBusinessName = useMemo(() => businesses.find((item) => item.id === activeBusinessId)?.name ?? '事業所', [businesses, activeBusinessId]);
  const scheduleBackupKey = useMemo(() => scheduleBackupKeyForBusiness(activeBusinessId), [activeBusinessId]);
  const businessDrafts = useMemo(() => savedDrafts.filter((draft) => draft.businessId === activeBusinessId), [savedDrafts, activeBusinessId]);

  const showToast = (message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
  };

  const refreshUi = () => {
    setInteractionVersion((prev) => prev + 1);
    setLastReloadAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
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

  const handleSuggestRoute = async () => {
    const nurse = nurses.find((item) => item.id === selectedNurseId);
    if (!nurse) return;
    const suggestion = await suggestOptimizedRoute(nurse, formatDateKey(currentDate), scheduledVisits);
    setRouteSuggestion(suggestion);
    if (!suggestion) return;
    await Promise.all(suggestion.orderedVisits.map((visit) => scheduleRepo.upsert(visit)));
    refreshUi();
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
  const scheduledByDate = useMemo(() => groupByDate(scheduledVisits), [scheduledVisits]);
  const workerAvailabilityByDate = useMemo(
    () => visibleDays.reduce<Record<string, WorkerAvailabilityItem[]>>((acc, day) => {
      acc[day.dateKey] = buildWorkerAvailabilityForDate(nurses, day.dateKey);
      return acc;
    }, {}),
    [visibleDays, nurses]
  );
  const alerts = useMemo(() => buildReviewAlerts(users, today), [users]);
  const documents = useMemo(() => buildDocumentDeadlines(users, today), [users]);
  const warnings = useMemo(() => buildConflictWarnings(scheduledVisits), [scheduledVisits]);
  const routeKmByArea = useMemo(() => scheduledVisits.reduce<Record<string, number>>((acc, visit) => {
    acc[visit.area] = (acc[visit.area] ?? 0) + (visit.estimatedTravelKm ?? 0);
    return acc;
  }, {}), [scheduledVisits]);
  const report = useMemo(() => buildMonthlyReport(effectiveCandidateVisits, scheduledVisits, routeKmByArea), [effectiveCandidateVisits, scheduledVisits, routeKmByArea]);

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
        viewMode={viewMode}
        onChangeViewMode={(mode) => {
          setViewMode(mode);
          refreshUi();
        }}
        onPrev={() => navigate(-1)}
        onNext={() => navigate(1)}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        onAutoAssign={handleAutoAssignClick}
      />

      <BusinessTabsPanel
        businesses={businesses}
        activeBusinessId={activeBusinessId}
        newBusinessName={newBusinessName}
        onChangeNewBusinessName={setNewBusinessName}
        onAddBusiness={() => { handleAddBusiness().catch((error) => showToast(error instanceof Error ? error.message : '事業所追加に失敗しました。', 'error')); }}
        onSwitchBusiness={(businessId) => { handleSwitchBusiness(businessId).catch((error) => showToast(error instanceof Error ? error.message : '事業所切替に失敗しました。', 'error')); }}
      />

      <section className="stats-grid">
        <article className="stat-card"><span>利用者数</span><strong>{users.length}</strong></article>
        <article className="stat-card"><span>未割当候補</span><strong>{unscheduledCandidates.length}</strong></article>
        <article className="stat-card"><span>確定訪問</span><strong>{scheduledVisits.length}</strong></article>
        <article className="stat-card"><span>看護師数</span><strong>{nurses.length}</strong></article>
        <article className="stat-card"><span>重複警告</span><strong>{warnings.length}</strong></article>
      </section>

      <div className="main-grid">
        <aside className="sidebar">
          <section className="card panel">
            <h2>CSV 管理画面</h2>
            <p className="helper-text">CSV取込後は利用者ボックスの時間を10分単位で微修正できます。〇で確定すると濃い色のFIX表示になり、確定欄へ自動移動します。すべての操作は事業所ごとに自動保存され、再表示後も復元されます。</p>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={10} />
            <div className="toolbar-actions left">
              <button className="primary" onClick={() => applyCsvText(csvText).catch((error) => showToast(error instanceof Error ? error.message : '利用者CSVの反映に失敗しました。', 'error'))}>CSV反映</button>
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
              <button onClick={handleClearUsersCsv}>利用者CSV削除</button>
            </div>
          </section>
          <DraftManagerPanel
            draftName={draftName}
            onChangeDraftName={setDraftName}
            onSaveDraft={handleSaveDraft}
            drafts={businessDrafts}
            onRestoreDraft={(draftId) => { handleRestoreDraft(draftId).catch((error) => showToast(error instanceof Error ? error.message : '下書き復元に失敗しました。', 'error')); }}
            onDeleteDraft={handleDeleteDraft}
          />
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
          <FiltersPanel filters={filters} areas={areaList} onChange={(next) => {
            setFilters(next);
            refreshUi();
          }} />
          <NurseMasterPanel nurses={nurses} onToggleActive={handleToggleNurse} onAdd={handleAddNurse} onImportCsv={handleNurseCsvFile} onClearCsv={handleClearNurseCsv} />
          <AlertsPanel alerts={alerts} />
          <DocumentsDashboard items={documents} />
          <ConflictWarningsPanel warnings={warnings} />
          <ReportsPanel report={report} />
          <RouteSuggestionPanel nurses={nurses} selectedNurseId={selectedNurseId} onSelectNurseId={(value) => {
            setSelectedNurseId(value);
            refreshUi();
          }} route={routeSuggestion} onSuggest={handleSuggestRoute} />
          <CandidateList key={`candidate-list-${interactionVersion}`} visits={unscheduledCandidates} areaColors={areaColors} onDragStart={setDraggedSlotId} />
          <ConfirmedSchedulePanel key={`confirmed-list-${interactionVersion}`} visits={scheduledVisits} nurses={nurses} onUpdate={handleUpdateScheduled} onRemove={handleRemoveScheduled} />
        </aside>
        <main className="content">
          <section className="card panel note-card">
            <h2>自動割当ロジック</h2>
            <p>看護師の月別希望時間、勤務曜日、午前/午後可否、訪問可能スキル、希望性別、同一時間帯重複、日次上限、同一エリア継続性を総合評価して最適割当します。各クリック・選択後は画面を即時再読込し、FIX色・確定欄・下書き保存へ反映します。</p>
          </section>
          <CalendarView
            key={`calendar-${interactionVersion}-${formatDateKey(currentDate)}-${viewMode}-${activeBusinessId}`}
            days={visibleDays}
            candidatesByDate={candidatesByDate}
            scheduledByDate={scheduledByDate}
            workerAvailabilityByDate={workerAvailabilityByDate}
            areaColors={areaColors}
            onDragStart={setDraggedSlotId}
            onDropCandidate={handleMoveCandidate}
            onConfirmCandidate={handleConfirmCandidate}
            onRemoveCandidate={handleRemoveCandidate}
            onRemoveScheduled={handleRemoveScheduled}
            onUpdateCandidateTime={handleUpdateCandidateTime}
            onUpdateScheduledTime={handleUpdateScheduledTime}
            viewMode={viewMode}
            periodLabel={formatMonthLabel(currentDate)}
          />
        </main>
      </div>
    </div>
  );
}

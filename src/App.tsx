import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { AlertsPanel } from './components/AlertsPanel';
import { CalendarView } from './components/CalendarView';
import { CandidateList } from './components/CandidateList';
import { CloudSyncPanel } from './components/CloudSyncPanel';
import { ConfirmedSchedulePanel } from './components/ConfirmedSchedulePanel';
import { ConflictWarningsPanel } from './components/ConflictWarningsPanel';
import { DocumentsDashboard } from './components/DocumentsDashboard';
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
import { applyFilters, buildCandidateVisits, getAreaColors, getUnscheduledCandidates, groupByDate, minutesToTime, timeToMinutes } from './utils/calendar';
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

export default function App() {
  const [csvText, setCsvText] = useState(isDemoMode() ? sampleCsv : '');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [scheduledMap, setScheduledMap] = useState<Record<string, ScheduledVisit>>({});
  const [hiddenCandidateIds, setHiddenCandidateIds] = useState<string[]>(() => loadFromStorage(HIDDEN_CANDIDATE_KEY, []));
  const [candidateOverrides, setCandidateOverrides] = useState<CandidateOverrideMap>(() => loadFromStorage(MOVED_CANDIDATE_KEY, {}));
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date(START_YEAR, START_MONTH, today.getDate()));
  const [draggedSlotId, setDraggedSlotId] = useState('');
  const [selectedNurseId, setSelectedNurseId] = useState('');
  const [routeSuggestion, setRouteSuggestion] = useState<RouteSuggestion | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ provider: currentSyncProvider(), connected: currentSyncProvider() !== 'local' });

  useEffect(() => subscribeAuth(setAuthUser), []);
  useEffect(() => saveToStorage(HIDDEN_CANDIDATE_KEY, hiddenCandidateIds), [hiddenCandidateIds]);
  useEffect(() => saveToStorage(MOVED_CANDIDATE_KEY, candidateOverrides), [candidateOverrides]);

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
      setScheduledMap(items.reduce<Record<string, ScheduledVisit>>((acc, item) => {
        acc[item.slotId] = item;
        return acc;
      }, {}));
      setSyncState((prev) => ({ ...prev, lastSyncedAt: new Date().toISOString() }));
    });
    return () => {
      unsubUsers();
      unsubNurses();
      unsubSchedules();
    };
  }, []);

  useEffect(() => {
    if (!authUser || !isDemoMode()) return;
    if (!users.length) {
      const parsed = parseCsv(sampleCsv);
      setUsers(parsed);
      parsed.forEach((item) => { userRepo.upsert(item); });
    }
    if (!nurses.length) {
      setNurses(sampleNurses);
      sampleNurses.forEach((item) => { nurseRepo.upsert(item); });
    }
  }, [authUser, users.length, nurses.length]);

  const visibleDays = useMemo(() => getVisibleDays(currentDate, viewMode), [currentDate, viewMode]);
  const areaList = useMemo(() => Array.from(new Set(users.map((user) => user.居住地))).sort((a, b) => a.localeCompare(b, 'ja')), [users]);
  const areaColors = useMemo(() => getAreaColors(areaList), [areaList]);

  const baseCandidateVisits = useMemo(() => buildCandidateVisits(users, visibleDays), [users, visibleDays]);
  const effectiveCandidateVisits = useMemo(
    () => applyCandidateCustomizations(baseCandidateVisits, hiddenCandidateIds, candidateOverrides),
    [baseCandidateVisits, hiddenCandidateIds, candidateOverrides]
  );
  const filteredCandidates = useMemo(() => applyFilters(effectiveCandidateVisits, filters), [effectiveCandidateVisits, filters]);
  const unscheduledCandidates = useMemo(() => getUnscheduledCandidates(filteredCandidates, scheduledMap), [filteredCandidates, scheduledMap]);
  const scheduledVisits = useMemo(() => Object.values(scheduledMap).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMinutes - b.startMinutes), [scheduledMap]);
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

  const showToast = (message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
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
        assignmentScore: score
      });
    });

    await scheduleRepo.clear();
    await Promise.all(assigned.map((visit) => scheduleRepo.upsert(visit)));
    setCurrentDate(targetDate);
    setViewMode('month');
    setRouteSuggestion(null);
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
    showToast('候補の日時を更新しました');
  };

  const handleConfirmCandidate = async (slotId: string) => {
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
    showToast(nurse ? `候補を確定しました（${nurse.name}）` : '候補を確定しました（未割当）');
  };

  const handleRemoveCandidate = (slotId: string) => {
    setHiddenCandidateIds((prev) => (prev.includes(slotId) ? prev : [...prev, slotId]));
    setCandidateOverrides((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    showToast('候補を削除しました');
  };

  const handleRemoveScheduled = async (slotId: string) => {
    await scheduleRepo.remove(slotId);
    showToast('確定スケジュールを削除しました');
  };

  const handleUpdateScheduled = async (visit: ScheduledVisit) => {
    await scheduleRepo.upsert(visit);
    showToast('スケジュールを更新しました');
  };

  const handleToggleNurse = async (id: string) => {
    const target = nurses.find((nurse) => nurse.id === id);
    if (!target || authUser?.role === 'nurse') return;
    await nurseRepo.upsert({ ...target, active: !target.active });
    showToast('ワーカー情報を更新しました');
  };

  const handleAddNurse = async (nurse: Omit<Nurse, 'id'>) => {
    if (authUser?.role === 'nurse') return;
    await nurseRepo.upsert({ ...nurse, id: crypto.randomUUID() });
    showToast('ワーカーを追加しました');
  };

  const handleSuggestRoute = async () => {
    const nurse = nurses.find((item) => item.id === selectedNurseId);
    if (!nurse) return;
    const suggestion = await suggestOptimizedRoute(nurse, formatDateKey(currentDate), scheduledVisits);
    setRouteSuggestion(suggestion);
    if (!suggestion) return;
    await Promise.all(suggestion.orderedVisits.map((visit) => scheduleRepo.upsert(visit)));
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
    await signOutUser();
    setAuthUser(null);
  };

  const handleClearUsersCsv = async () => {
    clearCandidateCustomizations();
    await Promise.all([userRepo.clear(), scheduleRepo.clear()]);
    setCsvText('');
    setUsers([]);
    setRouteSuggestion(null);
    showToast('利用者CSVを削除しました');
  };

  const handleClearNurseCsv = async () => {
    clearCandidateCustomizations();
    await Promise.all([nurseRepo.clear(), scheduleRepo.clear()]);
    setNurses([]);
    setRouteSuggestion(null);
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
      return;
    }
    if (viewMode === 'week') {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + delta * 7);
      setCurrentDate(next);
      return;
    }
    setCurrentDate(addMonths(currentDate, delta));
  };

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
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onPrev={() => navigate(-1)}
        onNext={() => navigate(1)}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        onAutoAssign={handleAutoAssignClick}
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
            <p className="helper-text">ワーカーCSVを読み込むと日別の看護師予定をカレンダー表示します。利用者候補はドラッグ＆ドロップで日付移動でき、ホバーした×で不要候補を削除できます。</p>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={10} />
            <div className="toolbar-actions left">
              <button className="primary" onClick={() => applyCsvText(csvText).catch((error) => showToast(error instanceof Error ? error.message : '利用者CSVの反映に失敗しました。', 'error'))}>CSV反映</button>
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
              <button onClick={handleClearUsersCsv}>利用者CSV削除</button>
            </div>
          </section>
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
          <FiltersPanel filters={filters} areas={areaList} onChange={setFilters} />
          <NurseMasterPanel nurses={nurses} onToggleActive={handleToggleNurse} onAdd={handleAddNurse} onImportCsv={handleNurseCsvFile} onClearCsv={handleClearNurseCsv} />
          <AlertsPanel alerts={alerts} />
          <DocumentsDashboard items={documents} />
          <ConflictWarningsPanel warnings={warnings} />
          <ReportsPanel report={report} />
          <RouteSuggestionPanel nurses={nurses} selectedNurseId={selectedNurseId} onSelectNurseId={setSelectedNurseId} route={routeSuggestion} onSuggest={handleSuggestRoute} />
          <CandidateList visits={unscheduledCandidates} areaColors={areaColors} onDragStart={setDraggedSlotId} />
          <ConfirmedSchedulePanel visits={scheduledVisits} nurses={nurses} onUpdate={handleUpdateScheduled} onRemove={handleRemoveScheduled} />
        </aside>
        <main className="content">
          <section className="card panel note-card">
            <h2>自動割当ロジック</h2>
            <p>看護師の月別希望時間、勤務曜日、午前/午後可否、訪問可能スキル、希望性別、同一時間帯重複、日次上限、同一エリア継続性を総合評価して最適割当します。</p>
          </section>
          <CalendarView
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
            viewMode={viewMode}
          />
        </main>
      </div>
    </div>
  );
}

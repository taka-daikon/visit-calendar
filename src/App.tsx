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
import { downloadTextFile, printHtml } from './services/persistence';
import { createNurseRepo, createScheduleRepo, createUserRepo } from './services/repository';
import { AuthUser, Filters, Nurse, RouteSuggestion, ScheduledVisit, SyncState, UserRecord, ViewMode } from './types';
import { applyFilters, buildCandidateVisits, getAreaColors, getUnscheduledCandidates, groupByDate } from './utils/calendar';
import { parseCsv } from './utils/csv';
import { START_MONTH, START_YEAR, addMonths, formatDateKey, formatMonthLabel, getVisibleDays } from './utils/date';
import { readCsvFileText } from './utils/fileText';
import { suggestOptimizedRoute } from './utils/mapsRouteService';
import { parseNurseCsv } from './utils/nurseCsv';
import { buildDocumentDeadlines, buildMonthlyReport, buildReviewAlerts, monthlyReportToCsv } from './utils/report';
import { autoAssignNurse, buildConflictWarnings } from './utils/scheduler';
import './styles.css';

const today = new Date('2026-03-28T09:00:00');
const defaultFilters: Filters = { keyword: '', area: '', insuranceType: '', nurseGender: '' };

const userRepo = createUserRepo();
const nurseRepo = createNurseRepo();
const scheduleRepo = createScheduleRepo();

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function resolveTargetMonth(sourceNurses: Nurse[], fallback: Date): Date {
  const target = sourceNurses.map((nurse) => nurse.monthlyAvailabilityMonth).find(Boolean);
  const match = target?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthStart(fallback);
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

export default function App() {
  const [csvText, setCsvText] = useState(isDemoMode() ? sampleCsv : '');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [scheduledMap, setScheduledMap] = useState<Record<string, ScheduledVisit>>({});
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
  const candidateVisits = useMemo(() => buildCandidateVisits(users, visibleDays), [users, visibleDays]);
  const filteredCandidates = useMemo(() => applyFilters(candidateVisits, filters), [candidateVisits, filters]);
  const unscheduledCandidates = useMemo(() => getUnscheduledCandidates(filteredCandidates, scheduledMap), [filteredCandidates, scheduledMap]);
  const scheduledVisits = useMemo(() => Object.values(scheduledMap).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMinutes - b.startMinutes), [scheduledMap]);
  const candidatesByDate = useMemo(() => groupByDate(unscheduledCandidates), [unscheduledCandidates]);
  const scheduledByDate = useMemo(() => groupByDate(scheduledVisits), [scheduledVisits]);
  const alerts = useMemo(() => buildReviewAlerts(users, today), [users]);
  const documents = useMemo(() => buildDocumentDeadlines(users, today), [users]);
  const warnings = useMemo(() => buildConflictWarnings(scheduledVisits), [scheduledVisits]);
  const routeKmByArea = useMemo(() => scheduledVisits.reduce<Record<string, number>>((acc, visit) => {
    acc[visit.area] = (acc[visit.area] ?? 0) + (visit.estimatedTravelKm ?? 0);
    return acc;
  }, {}), [scheduledVisits]);
  const report = useMemo(() => buildMonthlyReport(candidateVisits, scheduledVisits, routeKmByArea), [candidateVisits, scheduledVisits, routeKmByArea]);

  const showToast = (message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
  };

  const runAutoAssignment = async (sourceUsers = users, sourceNurses = nurses, baseDate = currentDate) => {
    if (!sourceUsers.length) throw new Error('先に利用者CSVを反映してください。');
    if (!sourceNurses.length) throw new Error('先にワーカーCSVを反映してください。');

    const targetDate = resolveTargetMonth(sourceNurses, baseDate);
    const days = getVisibleDays(targetDate, 'month').filter((day) => day.inMonth);
    const allCandidates = buildCandidateVisits(sourceUsers, days);
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

  const handleDropVisit = async () => {
    const visit = unscheduledCandidates.find((item) => item.slotId === draggedSlotId);
    if (!visit) return;
    const { nurse, score } = autoAssignNurse(visit, nurses, scheduledVisits);
    const scheduled: ScheduledVisit = {
      ...visit,
      confirmedAt: new Date().toISOString(),
      nurseId: nurse?.id,
      nurseName: nurse?.name,
      assignmentScore: score
    };
    await scheduleRepo.upsert(scheduled);
    setDraggedSlotId('');
    showToast('スケジュールを更新しました');
  };

  const handleRemoveScheduled = async (slotId: string) => {
    await scheduleRepo.remove(slotId);
    showToast('スケジュールを削除しました');
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

  const handleSeedDemo = async () => {
    if (!isDemoMode()) return;
    await Promise.all([userRepo.clear(), nurseRepo.clear(), scheduleRepo.clear()]);
    await applyCsvText(sampleCsv);
    await Promise.all(sampleNurses.map((nurse) => nurseRepo.upsert(nurse)));
    setSyncState((prev) => ({ ...prev, connected: true, error: undefined }));
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
    await Promise.all([userRepo.clear(), scheduleRepo.clear()]);
    setCsvText('');
    setUsers([]);
    setRouteSuggestion(null);
    showToast('利用者CSVを削除しました');
  };

  const handleClearNurseCsv = async () => {
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
        <article className="stat-card"><span>未確定候補</span><strong>{unscheduledCandidates.length}</strong></article>
        <article className="stat-card"><span>確定訪問</span><strong>{scheduledVisits.length}</strong></article>
        <article className="stat-card"><span>看護師数</span><strong>{nurses.length}</strong></article>
        <article className="stat-card"><span>重複警告</span><strong>{warnings.length}</strong></article>
      </section>

      <div className="main-grid">
        <aside className="sidebar">
          <section className="card panel">
            <h2>CSV 管理画面</h2>
            <p className="helper-text">Excel 保存時の文字化け対策として、UTF-8 / UTF-8 BOM / Shift_JIS のCSV読込に対応しました。利用者CSVを更新すると、ワーカーCSVが入っていれば自動で最適割当まで実行します。</p>
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
            <p>勤務曜日、午前/午後可否、月別の日別希望時間、訪問可能スキル、常勤/非常勤、希望性別、同一時間帯重複、日次上限、同一エリア継続性を総合評価して自動割当します。</p>
          </section>
          <CalendarView
            days={visibleDays}
            candidatesByDate={candidatesByDate}
            scheduledByDate={scheduledByDate}
            areaColors={areaColors}
            onDragStart={setDraggedSlotId}
            onDropVisit={handleDropVisit}
            onRemoveScheduled={handleRemoveScheduled}
            viewMode={viewMode}
          />
        </main>
      </div>
    </div>
  );
}

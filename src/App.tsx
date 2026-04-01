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
import { createNurseRepo, createScheduleRepo, createUserRepo } from './services/repository';
import { currentSyncProvider, isDemoMode } from './services/appEnv';
import { downloadTextFile, printHtml } from './services/persistence';
import { signIn, signOutUser, subscribeAuth } from './services/firebaseAuth';
import { applyFilters, buildCandidateVisits, getAreaColors, getUnscheduledCandidates, groupByDate } from './utils/calendar';
import { parseCsv } from './utils/csv';
import { parseNurseCsv } from './utils/nurseCsv';
import { START_MONTH, START_YEAR, addMonths, formatDateKey, formatMonthLabel, getVisibleDays } from './utils/date';
import { suggestOptimizedRoute } from './utils/mapsRouteService';
import { buildDocumentDeadlines, buildMonthlyReport, buildReviewAlerts, monthlyReportToCsv } from './utils/report';
import { autoAssignNurse, buildConflictWarnings } from './utils/scheduler';
import { AuthUser, CandidateVisit, Filters, Nurse, RouteSuggestion, ScheduledVisit, SyncState, UserRecord, ViewMode } from './types';
import './styles.css';

const today = new Date('2026-03-28T09:00:00');
const defaultFilters: Filters = { keyword: '', area: '', insuranceType: '', nurseGender: '' };

const userRepo = createUserRepo();
const nurseRepo = createNurseRepo();
const scheduleRepo = createScheduleRepo();

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
  const [syncState, setSyncState] = useState<SyncState>({ provider: currentSyncProvider(), connected: currentSyncProvider() !== 'local' });

  useEffect(() => subscribeAuth(setAuthUser), []);

  useEffect(() => {
    const unsubUsers = userRepo.subscribe((items) => {
      if (items.length) {
        setUsers(items);
      }
    });
    const unsubNurses = nurseRepo.subscribe((items) => {
      if (items.length) {
        setNurses(items);
      }
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

  const applyCsvText = async (text: string) => {
    const parsed = parseCsv(text);
    setCsvText(text);
    setUsers(parsed);
    await userRepo.clear();
    await Promise.all(parsed.map((user) => userRepo.upsert(user)));
  };

  const handleCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await applyCsvText(text);
  };

  const applyNurseCsvText = async (text: string) => {
    const parsed = parseNurseCsv(text);
    setNurses(parsed);
    await nurseRepo.clear();
    await Promise.all(parsed.map((nurse) => nurseRepo.upsert(nurse)));
  };

  const handleNurseCsvFile = async (file: File) => {
    const text = await file.text();
    await applyNurseCsvText(text);
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
  };

  const handleRemoveScheduled = async (slotId: string) => {
    await scheduleRepo.remove(slotId);
  };

  const handleUpdateScheduled = async (visit: ScheduledVisit) => {
    await scheduleRepo.upsert(visit);
  };

  const handleToggleNurse = async (id: string) => {
    const target = nurses.find((nurse) => nurse.id === id);
    if (!target || authUser?.role === 'nurse') return;
    await nurseRepo.upsert({ ...target, active: !target.active });
  };

  const handleAddNurse = async (nurse: Omit<Nurse, 'id'>) => {
    if (authUser?.role === 'nurse') return;
    await nurseRepo.upsert({ ...nurse, id: crypto.randomUUID() });
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
      <Toolbar
        periodLabel={formatMonthLabel(currentDate)}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onPrev={() => navigate(-1)}
        onNext={() => navigate(1)}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
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
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={10} />
            <div className="toolbar-actions left">
              <button className="primary" onClick={() => applyCsvText(csvText)}>CSV反映</button>
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
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
          <NurseMasterPanel nurses={nurses} onToggleActive={handleToggleNurse} onAdd={handleAddNurse} onImportCsv={handleNurseCsvFile} />
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
            <p>勤務曜日、午前/午後可否、訪問可能スキル、常勤/非常勤、希望性別、同一時間帯重複、日次上限、同一エリア継続性を総合評価して自動割当します。</p>
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

import { useState } from "react";
import {
  Plus,
  AlertTriangle,
  Clock,
  Search,
  ShieldPlus,
  Layers,
  Pencil,
  CalendarDays,
  Radar,
  Settings,
  LogOut,
  Eye,
  Unlock,
} from "lucide-react";

import "./styles/global.css";
import { styles } from "./styles/styles";
import { DEFAULT_LABELS } from "./constants";
import { todayISO, daysUntilMonthEnd, isExpired, formatMonthYear } from "./lib/dates";
import { urgency, medUrgency, medExpiredQty } from "./lib/medications";
import { useAuth } from "./hooks/useAuth";
import { usePharmacyData } from "./hooks/usePharmacyData";
import { hasLegacyData, hasMigrationRun } from "./lib/migrateLegacyData";

import { AuthScreen } from "./components/auth/AuthScreen";
import { MigrationPrompt } from "./components/MigrationPrompt";
import { SaveIndicator } from "./components/SaveIndicator";
import { ConfirmModal } from "./components/ConfirmModal";
import { Kpi } from "./components/Kpi";
import { TabButton } from "./components/TabButton";
import { EmptyState } from "./components/EmptyState";
import { SettingsPanel } from "./components/SettingsPanel";
import { MedCard } from "./components/MedCard";
import { MedHistory } from "./components/MedHistory";
import { FirstAidSection } from "./components/FirstAidSection";
import { LogSection } from "./components/LogSection";
import { DailyLogView } from "./components/DailyLogView";
import { TodayView } from "./components/TodayView";
import { Modal } from "./components/Modal";
import { SimpleForm } from "./components/forms/SimpleForm";
import { AddMedForm } from "./components/forms/AddMedForm";
import { AddBatchForm } from "./components/forms/AddBatchForm";
import { WithdrawForm } from "./components/forms/WithdrawForm";
import { AdjustBatchQtyForm } from "./components/forms/AdjustBatchQtyForm";

function LoadingScreen({ text }) {
  return (
    <div style={styles.loadingScreen}>
      <div style={styles.spinner} />
      <div style={{ color: "#5B6E6D", fontSize: 14 }}>{text}</div>
    </div>
  );
}

function NotConfiguredScreen() {
  return (
    <div style={styles.loadingScreen}>
      <div style={{ color: "#9A2E23", fontSize: 14, fontWeight: 700 }}>
        لم يتم إعداد الاتصال بقاعدة البيانات بعد
      </div>
      <div style={{ color: "#5B6E6D", fontSize: 13, maxWidth: 420, textAlign: "center" }}>
        أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في ملف .env (راجع
        .env.example) ثم أعد تشغيل التطبيق.
      </div>
    </div>
  );
}

// Shown only when the initial pharmacy-data load itself failed (network
// down, Supabase unreachable, etc.) — deliberately distinct from both the
// loading screen and a legitimate empty-inventory EmptyState, so "we
// couldn't load your data" is never mistaken for "this pharmacy has no
// medications."
function DataLoadErrorScreen({ message, onRetry }) {
  return (
    <div style={styles.loadingScreen}>
      <div style={{ color: "#9A2E23", fontSize: 14, fontWeight: 700 }}>
        تعذر تحميل بيانات الصيدلية
      </div>
      {message && (
        <div style={{ color: "#5B6E6D", fontSize: 12.5, maxWidth: 420, textAlign: "center" }}>
          {message}
        </div>
      )}
      <button style={styles.primaryBtn} onClick={onRetry}>
        إعادة المحاولة
      </button>
    </div>
  );
}

export default function PharmacyApp() {
  const {
    configured,
    user,
    profile,
    isAdmin,
    loading: authLoading,
    authError,
    signIn,
    signUp,
    signOut,
  } = useAuth();

  const clinicId = profile?.clinicId ?? null;
  const {
    state,
    loading: dataLoading,
    loadError,
    retryLoad,
    cloudStatus,
    error: dataError,
    refetch,
    addCategory,
    editCategory,
    addMedication,
    editMedication,
    deleteMedication,
    addBatch,
    deleteBatch,
    adjustBatchQty,
    withdrawStock,
    quickWithdrawOne,
    addFirstAid,
    editFirstAid,
    adjustFirstAid,
    deleteFirstAid,
    saveUiLabels,
    logHasMore,
    loadingMoreLog,
    logMoreError,
    loadMoreLog,
    logRefreshTick,
  } = usePharmacyData(clinicId);

  const [activeTab, setActiveTab] = useState("meds");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  // KPI-card shortcuts (dashboard-only viewing state — never touches
  // pharmacy data itself, and is always resettable from existing UI: the
  // sidebar's "كل الأدوية" button, or the filter banner's own clear link).
  const [medFilter, setMedFilter] = useState("all"); // "all" | "expired" | "critical"
  const [firstAidFilter, setFirstAidFilter] = useState("all"); // "all" | "low"
  const [sessionDate, setSessionDate] = useState(todayISO());
  const [showSettings, setShowSettings] = useState(false);
  const [migrationDismissed, setMigrationDismissed] = useState(false);

  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (title, message, onConfirm) =>
    setConfirmState({ title, message, onConfirm });

  const [showAddMed, setShowAddMed] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editCategoryItem, setEditCategoryItem] = useState(null);
  const [editMedItem, setEditMedItem] = useState(null);
  const [batchModalMed, setBatchModalMed] = useState(null);
  const [withdrawModalMed, setWithdrawModalMed] = useState(null);
  const [historyModalMed, setHistoryModalMed] = useState(null);
  const [showAddFirstAid, setShowAddFirstAid] = useState(false);
  const [editFirstAidItem, setEditFirstAidItem] = useState(null);
  const [adjustQtyTarget, setAdjustQtyTarget] = useState(null); // { med, batch }

  if (!configured) return <NotConfiguredScreen />;
  if (authLoading) return <LoadingScreen text="جارٍ التحقق من الجلسة…" />;
  if (!user) {
    return (
      <AuthScreen
        appTitle={DEFAULT_LABELS.appTitle}
        appSubtitle={DEFAULT_LABELS.appSubtitle}
        signIn={signIn}
        signUp={signUp}
        authError={authError}
      />
    );
  }
  if (!profile) return <LoadingScreen text="جارٍ تحميل بيانات الحساب…" />;
  if (dataLoading) return <LoadingScreen text="جاري تحميل بيانات الصيدلية…" />;
  if (loadError || !state) {
    return <DataLoadErrorScreen message={loadError} onRetry={retryLoad} />;
  }

  const L = { ...DEFAULT_LABELS, ...state.uiLabels };
  // kept as a short local alias — matches the prop name every component below already expects.
  //
  // Current split (admin: full CRUD + settings; staff: view + withdraw + first-aid
  // qty adjust) is the initial/test permission model, enforced for real in
  // supabase/migrations/0002_rls_policies.sql — NOT finalized business rules.
  // If staff's allowed actions change, the actual authorization edit happens in a
  // NEW RLS migration (never by editing 0002 in place); this UI gating just follows
  // whatever the database allows.
  const isOwner = isAdmin;

  const showMigrationPrompt =
    isAdmin &&
    !migrationDismissed &&
    !hasMigrationRun() &&
    hasLegacyData() &&
    state.categories.length === 0 &&
    state.medications.length === 0 &&
    state.firstAid.length === 0;

  // ---- derived data ----
  // Same medication-level conditions the "أقل من شهر" KPI's own batch-level
  // count below is built from (urgency()/daysUntilMonthEnd()), just applied
  // per-medication instead of per-batch, so a medication card shows up
  // whenever ANY of its batches matches — no second expiry definition.
  const medHasExpiredStock = (m) => medExpiredQty(m) > 0;
  const medHasCriticalStock = (m) =>
    m.batches.some(
      (b) => b.qty > 0 && urgency(daysUntilMonthEnd(b.expiry)) === "critical",
    );

  const filteredMeds = state.medications.filter((m) => {
    const matchesCat =
      activeCategory === "all" || m.categoryId === activeCategory;
    const matchesSearch = m.name
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    const matchesKpiFilter =
      medFilter === "all" ||
      (medFilter === "expired" && medHasExpiredStock(m)) ||
      (medFilter === "critical" && medHasCriticalStock(m));
    return matchesCat && matchesSearch && matchesKpiFilter;
  });
  const sortedMeds = [...filteredMeds].sort((a, b) => {
    const order = { expired: 0, critical: 1, warning: 2, ok: 3, empty: 4 };
    return order[medUrgency(a)] - order[medUrgency(b)];
  });

  const allBatches = state.medications.flatMap((m) => m.batches);
  const expiredCount = allBatches.filter(
    (b) => b.qty > 0 && isExpired(b.expiry),
  ).length;
  const criticalCount = allBatches.filter(
    (b) => b.qty > 0 && urgency(daysUntilMonthEnd(b.expiry)) === "critical",
  ).length;
  const lowFirstAid = state.firstAid.filter(
    (f) => f.qty <= f.threshold,
  ).length;

  const filteredFirstAid =
    firstAidFilter === "low"
      ? state.firstAid.filter((f) => f.qty <= f.threshold)
      : state.firstAid;

  const goToMeds = (filter) => {
    setActiveTab("meds");
    setActiveCategory("all");
    setSearch("");
    setMedFilter(filter);
  };
  const clearMedFilter = () => setMedFilter("all");

  const MED_FILTER_BANNER = {
    expired: {
      text: "عرض الأدوية التي تحتوي على مخزون منتهي الصلاحية فقط.",
      empty: {
        title: "لا يوجد أدوية منتهية الصلاحية",
        subtitle: "لا يوجد حاليًا أي دواء يحتوي على مخزون منتهي الصلاحية.",
      },
    },
    critical: {
      text: "عرض الأدوية التي تنتهي صلاحيتها خلال أقل من شهر فقط.",
      empty: {
        title: "لا يوجد أدوية تنتهي قريبًا",
        subtitle: "لا يوجد حاليًا أي دواء تنتهي صلاحيته خلال أقل من شهر.",
      },
    },
  };

  // ---- render ----
  return (
    <div dir="rtl" style={styles.app}>
      <header className="app-header" style={styles.header}>
        <div className="app-header-top" style={styles.headerTop}>
          <div style={styles.headerTitleRow}>
            <div style={styles.headerLogo}>
              <Radar size={20} color="#F6F5F1" />
            </div>
            <div>
              <h1 style={styles.h1}>{L.appTitle}</h1>
              <div style={styles.subtitle}>{L.appSubtitle}</div>
            </div>
          </div>
          <div className="app-auth-row" style={styles.authRow}>
            <span className="app-role-tag" style={styles.roleTag}>
              <span style={styles.roleTagFixed}>
                {isAdmin ? <Unlock size={12} /> : <Eye size={12} />}
                {isAdmin ? "وضع المسؤول" : "وضع الموظف"} ·
              </span>
              <span style={styles.roleTagEmail}>{user.email}</span>
            </span>
            {isAdmin && (
              <button
                style={styles.headerIconBtn}
                onClick={() => setShowSettings(true)}
                title="الإعدادات"
              >
                <Settings size={15} />
              </button>
            )}
            <button
              style={styles.headerIconBtn}
              onClick={signOut}
              title="تسجيل خروج"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
        <div className="kpi-row" style={styles.kpiRow}>
          <Kpi
            icon={<AlertTriangle size={16} />}
            value={expiredCount}
            label={L.kpiExpired}
            tone="expired"
            onClick={() => goToMeds("expired")}
          />
          <Kpi
            icon={<Clock size={16} />}
            value={criticalCount}
            label={L.kpiCritical}
            tone="critical"
            onClick={() => goToMeds("critical")}
          />
          <Kpi
            icon={<ShieldPlus size={16} />}
            value={lowFirstAid}
            label={L.kpiLowFirstAid}
            tone="warning"
            onClick={() => {
              setActiveTab("firstaid");
              setFirstAidFilter("low");
            }}
          />
          <Kpi
            icon={<Layers size={16} />}
            value={state.medications.length}
            label={L.kpiMedCount}
            tone="ok"
            onClick={() => goToMeds("all")}
          />
        </div>
      </header>

      <nav style={styles.tabs}>
        <TabButton
          active={activeTab === "today"}
          onClick={() => setActiveTab("today")}
          label={L.tabToday}
        />
        <TabButton
          active={activeTab === "meds"}
          onClick={() => setActiveTab("meds")}
          label={L.tabMeds}
        />
        <TabButton
          active={activeTab === "firstaid"}
          onClick={() => setActiveTab("firstaid")}
          label={L.tabFirstAid}
        />
        <TabButton
          active={activeTab === "log"}
          onClick={() => setActiveTab("log")}
          label={L.tabLog}
        />
        <TabButton
          active={activeTab === "dailyLog"}
          onClick={() => setActiveTab("dailyLog")}
          label={L.tabDailyLog}
        />
      </nav>

      <SaveIndicator status={cloudStatus} error={dataError} />

      {showMigrationPrompt && (
        <MigrationPrompt
          clinicId={clinicId}
          onDismiss={() => setMigrationDismissed(true)}
          onMigrated={refetch}
        />
      )}

      {activeTab === "today" && (
        <TodayView
          categories={state.categories}
          medications={state.medications}
          firstAid={state.firstAid}
          onGoToMed={(med) => {
            setActiveTab("meds");
            setActiveCategory(med.categoryId || "all");
            setSearch(med.name);
          }}
          onGoToFirstAid={() => setActiveTab("firstaid")}
        />
      )}

      {activeTab === "meds" && (
        <div className="pharmacy-body" style={styles.body}>
          <aside className="pharmacy-sidebar" style={styles.sidebar}>
            <button
              style={styles.sideItem(activeCategory === "all")}
              onClick={() => {
                setActiveCategory("all");
                clearMedFilter();
              }}
            >
              {L.sidebarAll}
              <span style={styles.countBadge}>{state.medications.length}</span>
            </button>
            {state.categories.map((c) => (
              <div key={c.id} style={styles.sideItemRow}>
                <button
                  style={{
                    ...styles.sideItem(activeCategory === c.id),
                    flex: 1,
                  }}
                  onClick={() => setActiveCategory(c.id)}
                >
                  {c.name}
                  <span style={styles.countBadge}>
                    {
                      state.medications.filter((m) => m.categoryId === c.id)
                        .length
                    }
                  </span>
                </button>
                {isOwner && (
                  <button
                    style={styles.editPencil}
                    onClick={() => setEditCategoryItem(c)}
                    title="تعديل اسم الفئة"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            ))}
            {isOwner && (
              <button
                style={styles.addCategoryBtn}
                onClick={() => setShowAddCategory(true)}
              >
                <Plus size={14} /> {L.addCategoryBtn}
              </button>
            )}
          </aside>

          <main className="pharmacy-main" style={styles.main}>
            {medFilter !== "all" && (
              <div style={styles.filterBanner}>
                <span>{MED_FILTER_BANNER[medFilter].text}</span>
                <button style={styles.filterBannerClear} onClick={clearMedFilter}>
                  ✕ إلغاء التصفية — عرض كل الأدوية
                </button>
              </div>
            )}
            <div style={styles.toolbar}>
              <div style={styles.searchBox}>
                <Search size={16} color="#7C918F" />
                <input
                  style={styles.searchInput}
                  placeholder={L.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {isOwner && (
                <button
                  style={styles.primaryBtn}
                  onClick={() => setShowAddMed(true)}
                >
                  <Plus size={16} /> {L.addMedBtn}
                </button>
              )}
            </div>

            {isOwner && (
              <div style={styles.sessionBar}>
                <CalendarDays size={16} color="#145C5C" />
                <span style={styles.sessionLabel}>{L.sessionLabel}</span>
                <input
                  type="date"
                  style={styles.sessionInput}
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
                <span style={styles.sessionHint}>{L.sessionHint}</span>
              </div>
            )}

            {sortedMeds.length === 0 ? (
              <EmptyState
                title={
                  state.medications.length === 0
                    ? L.emptyMedsTitle
                    : medFilter !== "all"
                      ? MED_FILTER_BANNER[medFilter].empty.title
                      : "لا نتائج مطابقة"
                }
                subtitle={
                  state.medications.length === 0
                    ? L.emptyMedsSubtitle
                    : medFilter !== "all"
                      ? MED_FILTER_BANNER[medFilter].empty.subtitle
                      : "جرّب كلمة بحث أو فئة مختلفة."
                }
              />
            ) : (
              <div style={styles.medGrid}>
                {sortedMeds.map((med) => (
                  <MedCard
                    key={med.id}
                    med={med}
                    L={L}
                    isOwner={isOwner}
                    categoryName={
                      state.categories.find((c) => c.id === med.categoryId)
                        ?.name
                    }
                    onQuickWithdraw={() => quickWithdrawOne(med, sessionDate)}
                    onAddBatch={() => setBatchModalMed(med)}
                    onWithdrawCustom={() => setWithdrawModalMed(med)}
                    onHistory={() => setHistoryModalMed(med)}
                    onEdit={() => setEditMedItem(med)}
                    onDeleteBatch={(batchId) => {
                      const batch = med.batches.find((b) => b.id === batchId);
                      askConfirm(
                        "حذف الدفعة",
                        batch
                          ? `هل أنت متأكد من حذف هذه الدفعة (${batch.qty} وحدة، تنتهي في ${formatMonthYear(batch.expiry)})؟ لا يمكن التراجع عن هذا الإجراء.`
                          : "هل أنت متأكد من حذف هذه الدفعة؟ لا يمكن التراجع عن هذا الإجراء.",
                        () => deleteBatch(med.id, batchId),
                      );
                    }}
                    onAdjustBatchQty={(batchId) => {
                      const batch = med.batches.find((b) => b.id === batchId);
                      if (batch) setAdjustQtyTarget({ med, batch });
                    }}
                    onDeleteMed={() => {
                      const batchCount = med.batches.length;
                      askConfirm(
                        "حذف الدواء",
                        batchCount > 0
                          ? `هل أنت متأكد من حذف "${med.name}"؟ حذف هذا الدواء سيؤدي أيضًا إلى حذف الدفعات المرتبطة به من المخزون (${batchCount} ${
                              batchCount === 1 ? "دفعة" : "دفعات"
                            }). لا يمكن التراجع عن هذا الإجراء.`
                          : `هل أنت متأكد من حذف "${med.name}"؟ لا يمكن التراجع عن هذا الإجراء.`,
                        () => deleteMedication(med.id),
                      );
                    }}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {activeTab === "firstaid" && (
        <>
          {firstAidFilter === "low" && (
            <div style={{ ...styles.filterBanner, margin: "10px 12px 0" }}>
              <span>عرض مواد الإسعافات الأولية الناقصة عن حد التنبيه فقط.</span>
              <button
                style={styles.filterBannerClear}
                onClick={() => setFirstAidFilter("all")}
              >
                ✕ إلغاء التصفية — عرض كل المواد
              </button>
            </div>
          )}

          {firstAidFilter === "low" && filteredFirstAid.length === 0 ? (
            <main className="pharmacy-main" style={{ ...styles.main, width: "100%" }}>
              <EmptyState
                title="لا يوجد مواد إسعاف ناقصة"
                subtitle="جميع مواد الإسعافات الأولية أعلى من حد التنبيه حاليًا."
              />
            </main>
          ) : (
            <FirstAidSection
              L={L}
              isOwner={isOwner}
              items={filteredFirstAid}
              onAdd={() => setShowAddFirstAid(true)}
              onAdjust={adjustFirstAid}
              onDelete={(id) => {
                const item = state.firstAid.find((f) => f.id === id);
                askConfirm(
                  "حذف مادة الإسعاف",
                  `هل أنت متأكد من حذف "${item?.name ?? ""}"؟ لا يمكن التراجع عن هذا الإجراء.`,
                  () => deleteFirstAid(id),
                );
              }}
              onEdit={(item) => setEditFirstAidItem(item)}
            />
          )}
        </>
      )}

      {activeTab === "log" && (
        <LogSection
          L={L}
          log={state.log}
          hasMore={logHasMore}
          loadingMore={loadingMoreLog}
          loadMoreError={logMoreError}
          onLoadMore={loadMoreLog}
        />
      )}

      {activeTab === "dailyLog" && <DailyLogView refreshSignal={logRefreshTick} />}

      {showSettings && isOwner && (
        <Modal title="الإعدادات" onClose={() => setShowSettings(false)} wide>
          <SettingsPanel
            labels={L}
            currentUserId={user.id}
            onSaveLabels={(next) => {
              saveUiLabels(next);
            }}
          />
        </Modal>
      )}

      {showAddCategory && (
        <Modal title="فئة جديدة" onClose={() => setShowAddCategory(false)}>
          <SimpleForm
            fields={[
              {
                key: "name",
                label: "اسم الفئة",
                placeholder: "مثال: مضادات حساسية",
              },
            ]}
            submitLabel="إضافة"
            onSubmit={(v) => {
              if (v.name?.trim()) addCategory(v.name.trim());
              setShowAddCategory(false);
            }}
          />
        </Modal>
      )}

      {editCategoryItem && (
        <Modal
          title="تعديل اسم الفئة"
          onClose={() => setEditCategoryItem(null)}
        >
          <SimpleForm
            fields={[
              { key: "name", label: "اسم الفئة", placeholder: "اسم الفئة" },
            ]}
            initial={{ name: editCategoryItem.name }}
            submitLabel="حفظ"
            onSubmit={(v) => {
              if (v.name?.trim())
                editCategory(editCategoryItem.id, v.name.trim());
              setEditCategoryItem(null);
            }}
          />
        </Modal>
      )}

      {showAddMed && (
        <Modal title="دواء جديد" onClose={() => setShowAddMed(false)}>
          <AddMedForm
            categories={state.categories}
            onSubmit={(v) => {
              if (v.name?.trim() && v.categoryId)
                addMedication({
                  name: v.name.trim(),
                  categoryId: v.categoryId,
                });
              setShowAddMed(false);
            }}
          />
        </Modal>
      )}

      {editMedItem && (
        <Modal title="تعديل بيانات الدواء" onClose={() => setEditMedItem(null)}>
          <AddMedForm
            categories={state.categories}
            initial={{
              name: editMedItem.name,
              categoryId: editMedItem.categoryId,
            }}
            submitLabel="حفظ التعديل"
            onSubmit={(v) => {
              if (v.name?.trim() && v.categoryId)
                editMedication(editMedItem.id, {
                  name: v.name.trim(),
                  categoryId: v.categoryId,
                });
              setEditMedItem(null);
            }}
          />
        </Modal>
      )}

      {batchModalMed && (
        <Modal
          title={`إضافة دفعة — ${batchModalMed.name}`}
          onClose={() => setBatchModalMed(null)}
        >
          <AddBatchForm
            onSubmit={(v) => {
              if (v.expiry && v.qty)
                addBatch(batchModalMed.id, { expiry: v.expiry, qty: v.qty });
              setBatchModalMed(null);
            }}
          />
        </Modal>
      )}

      {adjustQtyTarget && (
        <Modal
          title={`تعديل الكمية — ${adjustQtyTarget.med.name}`}
          onClose={() => setAdjustQtyTarget(null)}
        >
          <AdjustBatchQtyForm
            medName={adjustQtyTarget.med.name}
            batch={
              // prefer the live batch from state (post-refetch), falling
              // back to the one captured when the modal was opened
              state.medications
                .find((m) => m.id === adjustQtyTarget.med.id)
                ?.batches.find((b) => b.id === adjustQtyTarget.batch.id) ||
              adjustQtyTarget.batch
            }
            onSubmit={(newQty, reason) => {
              adjustBatchQty(adjustQtyTarget.batch.id, newQty, reason);
              setAdjustQtyTarget(null);
            }}
            onCancel={() => setAdjustQtyTarget(null)}
          />
        </Modal>
      )}

      {withdrawModalMed && (
        <Modal
          title={`صرف مخصّص — ${withdrawModalMed.name}`}
          onClose={() => setWithdrawModalMed(null)}
        >
          <WithdrawForm
            med={
              state.medications.find((m) => m.id === withdrawModalMed.id) ||
              withdrawModalMed
            }
            sessionDate={sessionDate}
            onSubmit={(batchId, qty, date) => {
              withdrawStock(withdrawModalMed.id, batchId, qty, date);
              setWithdrawModalMed(null);
            }}
          />
        </Modal>
      )}

      {historyModalMed && (
        <Modal
          title={`سجلّ وحصيلة — ${historyModalMed.name}`}
          onClose={() => setHistoryModalMed(null)}
          wide
        >
          <MedHistory
            med={
              state.medications.find((m) => m.id === historyModalMed.id) ||
              historyModalMed
            }
            refreshSignal={logRefreshTick}
          />
        </Modal>
      )}

      {showAddFirstAid && (
        <Modal
          title="مادة إسعاف جديدة"
          onClose={() => setShowAddFirstAid(false)}
        >
          <SimpleForm
            fields={[
              {
                key: "name",
                label: "اسم المادة",
                placeholder: "مثال: شاش معقم",
              },
              {
                key: "qty",
                label: "الكمية الحالية",
                type: "number",
                placeholder: "0",
              },
              {
                key: "threshold",
                label: "حد التنبيه (تحته تعتبر ناقصة)",
                type: "number",
                placeholder: "5",
              },
            ]}
            submitLabel="إضافة"
            onSubmit={(v) => {
              if (v.name?.trim())
                addFirstAid({
                  name: v.name.trim(),
                  qty: v.qty || 0,
                  threshold: v.threshold || 0,
                });
              setShowAddFirstAid(false);
            }}
          />
        </Modal>
      )}

      {editFirstAidItem && (
        <Modal
          title="تعديل مادة الإسعاف"
          onClose={() => setEditFirstAidItem(null)}
        >
          <SimpleForm
            fields={[
              { key: "name", label: "اسم المادة", placeholder: "اسم المادة" },
              {
                key: "threshold",
                label: "حد التنبيه",
                type: "number",
                placeholder: "5",
              },
            ]}
            initial={{
              name: editFirstAidItem.name,
              threshold: editFirstAidItem.threshold,
            }}
            submitLabel="حفظ"
            onSubmit={(v) => {
              if (v.name?.trim())
                editFirstAid(editFirstAidItem.id, {
                  name: v.name.trim(),
                  threshold: v.threshold,
                });
              setEditFirstAidItem(null);
            }}
          />
        </Modal>
      )}

      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          onConfirm={() => {
            confirmState.onConfirm();
            setConfirmState(null);
          }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

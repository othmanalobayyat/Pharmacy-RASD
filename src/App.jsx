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
import { todayISO, daysUntil } from "./lib/dates";
import { urgency, medUrgency } from "./lib/medications";
import { useAuth } from "./hooks/useAuth";
import { usePharmacyData } from "./hooks/usePharmacyData";
import { hasLegacyData, hasMigrationRun } from "./lib/migrateLegacyData";

import { AuthScreen } from "./components/auth/AuthScreen";
import { MigrationPrompt } from "./components/MigrationPrompt";
import { SaveIndicator } from "./components/SaveIndicator";
import { Kpi } from "./components/Kpi";
import { TabButton } from "./components/TabButton";
import { EmptyState } from "./components/EmptyState";
import { SettingsPanel } from "./components/SettingsPanel";
import { MedCard } from "./components/MedCard";
import { MedHistory } from "./components/MedHistory";
import { FirstAidSection } from "./components/FirstAidSection";
import { LogSection } from "./components/LogSection";
import { Modal } from "./components/Modal";
import { SimpleForm } from "./components/forms/SimpleForm";
import { AddMedForm } from "./components/forms/AddMedForm";
import { AddBatchForm } from "./components/forms/AddBatchForm";
import { WithdrawForm } from "./components/forms/WithdrawForm";

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
    withdrawStock,
    quickWithdrawOne,
    addFirstAid,
    editFirstAid,
    adjustFirstAid,
    deleteFirstAid,
    saveUiLabels,
  } = usePharmacyData(clinicId);

  const [activeTab, setActiveTab] = useState("meds");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sessionDate, setSessionDate] = useState(todayISO());
  const [showSettings, setShowSettings] = useState(false);
  const [migrationDismissed, setMigrationDismissed] = useState(false);

  const [showAddMed, setShowAddMed] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editCategoryItem, setEditCategoryItem] = useState(null);
  const [editMedItem, setEditMedItem] = useState(null);
  const [batchModalMed, setBatchModalMed] = useState(null);
  const [withdrawModalMed, setWithdrawModalMed] = useState(null);
  const [historyModalMed, setHistoryModalMed] = useState(null);
  const [showAddFirstAid, setShowAddFirstAid] = useState(false);
  const [editFirstAidItem, setEditFirstAidItem] = useState(null);

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
  if (dataLoading || !state) return <LoadingScreen text="جاري تحميل بيانات الصيدلية…" />;

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
  const filteredMeds = state.medications.filter((m) => {
    const matchesCat =
      activeCategory === "all" || m.categoryId === activeCategory;
    const matchesSearch = m.name
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    return matchesCat && matchesSearch;
  });
  const sortedMeds = [...filteredMeds].sort((a, b) => {
    const order = { expired: 0, critical: 1, warning: 2, ok: 3, empty: 4 };
    return order[medUrgency(a)] - order[medUrgency(b)];
  });

  const allBatches = state.medications.flatMap((m) => m.batches);
  const expiredCount = allBatches.filter(
    (b) => b.qty > 0 && urgency(daysUntil(b.expiry)) === "expired",
  ).length;
  const criticalCount = allBatches.filter(
    (b) => b.qty > 0 && urgency(daysUntil(b.expiry)) === "critical",
  ).length;
  const lowFirstAid = state.firstAid.filter(
    (f) => f.qty <= f.threshold,
  ).length;

  // ---- render ----
  return (
    <div dir="rtl" style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div style={styles.headerTitleRow}>
            <div style={styles.headerLogo}>
              <Radar size={20} color="#F6F5F1" />
            </div>
            <div>
              <h1 style={styles.h1}>{L.appTitle}</h1>
              <div style={styles.subtitle}>{L.appSubtitle}</div>
            </div>
          </div>
          <div style={styles.authRow}>
            <span style={styles.roleTag}>
              {isAdmin ? <Unlock size={12} /> : <Eye size={12} />}{" "}
              {isAdmin ? "وضع المسؤول" : "وضع الموظف"} · {user.email}
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
        <div style={styles.kpiRow}>
          <Kpi
            icon={<AlertTriangle size={16} />}
            value={expiredCount}
            label={L.kpiExpired}
            tone="expired"
          />
          <Kpi
            icon={<Clock size={16} />}
            value={criticalCount}
            label={L.kpiCritical}
            tone="critical"
          />
          <Kpi
            icon={<ShieldPlus size={16} />}
            value={lowFirstAid}
            label={L.kpiLowFirstAid}
            tone="warning"
          />
          <Kpi
            icon={<Layers size={16} />}
            value={state.medications.length}
            label={L.kpiMedCount}
            tone="ok"
          />
        </div>
      </header>

      <nav style={styles.tabs}>
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
      </nav>

      <SaveIndicator status={cloudStatus} error={dataError} />

      {showMigrationPrompt && (
        <MigrationPrompt
          clinicId={clinicId}
          onDismiss={() => setMigrationDismissed(true)}
          onMigrated={refetch}
        />
      )}

      {activeTab === "meds" && (
        <div className="pharmacy-body" style={styles.body}>
          <aside className="pharmacy-sidebar" style={styles.sidebar}>
            <button
              style={styles.sideItem(activeCategory === "all")}
              onClick={() => setActiveCategory("all")}
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
                    : "لا نتائج مطابقة"
                }
                subtitle={
                  state.medications.length === 0
                    ? L.emptyMedsSubtitle
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
                    onDeleteBatch={(batchId) => deleteBatch(med.id, batchId)}
                    onDeleteMed={() => deleteMedication(med.id)}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {activeTab === "firstaid" && (
        <FirstAidSection
          L={L}
          isOwner={isOwner}
          items={state.firstAid}
          onAdd={() => setShowAddFirstAid(true)}
          onAdjust={adjustFirstAid}
          onDelete={deleteFirstAid}
          onEdit={(item) => setEditFirstAidItem(item)}
        />
      )}

      {activeTab === "log" && <LogSection L={L} log={state.log} />}

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
            log={state.log}
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
    </div>
  );
}

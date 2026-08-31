import { useMemo } from "react";
import { AlertTriangle, Clock3, PackageX } from "lucide-react";
import { styles } from "../styles/styles";
import { URGENCY_STYLE } from "../constants";
import { formatMonthYear, isExpiringThisMonth } from "../lib/dates";
import { medAvailableQty, medExpiredQty } from "../lib/medications";
import { formatSampleQty } from "../lib/format";

// Operational "what needs my attention today" screen — deliberately NOT a
// replacement for the Meds tab (inventory management still happens there).
// Everything here is computed from data the app already has loaded
// (state.medications/state.firstAid/state.categories); no new query is
// issued, and all expiry/stock math is reused from lib/dates.js and
// lib/medications.js exactly as used everywhere else in the app.
function TriageSection({ icon, title, tone, items, emptyText, renderItem }) {
  const c = URGENCY_STYLE[tone];
  return (
    <div style={styles.triageSection}>
      <div style={styles.triageSectionHead}>
        <span style={{ ...styles.triageSectionIcon, background: c.bg, color: c.fg }}>
          {icon}
        </span>
        <span style={styles.triageSectionTitle}>{title}</span>
        <span style={styles.triageSectionCount}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={styles.triageEmpty}>{emptyText}</div>
      ) : (
        <div style={styles.triageList}>{items.map(renderItem)}</div>
      )}
    </div>
  );
}

export function TodayView({ categories, medications, firstAid, onGoToMed, onGoToFirstAid }) {
  const categoryName = (id) => categories.find((c) => c.id === id)?.name || "بدون فئة";

  const expiredMeds = useMemo(
    () =>
      medications
        .map((med) => ({ med, expiredQty: medExpiredQty(med) }))
        .filter((x) => x.expiredQty > 0)
        .sort((a, b) => b.expiredQty - a.expiredQty),
    [medications],
  );

  const expiringThisMonth = useMemo(
    () =>
      medications
        .map((med) => ({
          med,
          batches: med.batches.filter((b) => b.qty > 0 && isExpiringThisMonth(b.expiry)),
        }))
        .filter((x) => x.batches.length > 0),
    [medications],
  );

  const lowStockItems = useMemo(() => {
    const meds = medications
      .filter((med) => medAvailableQty(med) === 0)
      .map((med) => ({ kind: "med", key: `m-${med.id}`, med }));
    const aid = firstAid
      .filter((item) => item.qty <= item.threshold)
      .map((item) => ({ kind: "firstAid", key: `f-${item.id}`, item }));
    return [...meds, ...aid];
  }, [medications, firstAid]);

  return (
    <main className="pharmacy-main" style={{ ...styles.main, width: "100%" }}>
      <div style={styles.triageIntro}>
        أهم ما يحتاج انتباهك اليوم — محسوب مباشرة من بيانات المخزون الحالية.
      </div>

      <TriageSection
        icon={<AlertTriangle size={14} />}
        title="منتهية الصلاحية"
        tone="expired"
        items={expiredMeds}
        emptyText="لا يوجد أدوية منتهية الصلاحية حاليًا."
        renderItem={({ med, expiredQty }) => (
          <button key={med.id} type="button" style={styles.triageItem} onClick={() => onGoToMed(med)}>
            <span style={styles.triageItemName}>{med.name}</span>
            <span style={styles.triageItemMeta}>
              {categoryName(med.categoryId)} · {formatSampleQty(expiredQty)} منتهية
            </span>
          </button>
        )}
      />

      <TriageSection
        icon={<Clock3 size={14} />}
        title="تنتهي هذا الشهر"
        tone="critical"
        items={expiringThisMonth}
        emptyText="لا يوجد أدوية تنتهي صلاحيتها هذا الشهر."
        renderItem={({ med, batches }) => (
          <button key={med.id} type="button" style={styles.triageItem} onClick={() => onGoToMed(med)}>
            <span style={styles.triageItemName}>{med.name}</span>
            <span style={styles.triageItemMeta}>
              {categoryName(med.categoryId)} · ينتهي {formatMonthYear(batches[0].expiry)}
            </span>
          </button>
        )}
      />

      <TriageSection
        icon={<PackageX size={14} />}
        title="مخزون منخفض / غير متوفر"
        tone="warning"
        items={lowStockItems}
        emptyText="لا يوجد نقص حاليًا في الأدوية أو مواد الإسعاف."
        renderItem={(entry) =>
          entry.kind === "med" ? (
            <button
              key={entry.key}
              type="button"
              style={styles.triageItem}
              onClick={() => onGoToMed(entry.med)}
            >
              <span style={styles.triageItemName}>{entry.med.name}</span>
              <span style={styles.triageItemMeta}>
                {categoryName(entry.med.categoryId)} · لا يوجد كمية متاحة للصرف
              </span>
            </button>
          ) : (
            <button
              key={entry.key}
              type="button"
              style={styles.triageItem}
              onClick={onGoToFirstAid}
            >
              <span style={styles.triageItemName}>{entry.item.name}</span>
              <span style={styles.triageItemMeta}>
                إسعافات أولية · {entry.item.qty} من أصل حد {entry.item.threshold}
              </span>
            </button>
          )
        }
      />
    </main>
  );
}

import { History, Minus, Pencil, Plus, Trash2, TrendingDown, X } from "lucide-react";
import { styles } from "../styles/styles";
import { URGENCY_STYLE } from "../constants";
import { daysUntilMonthEnd, formatMonthYear } from "../lib/dates";
import { medAvailableQty, medExpiredQty, urgency } from "../lib/medications";
import { formatSampleQty } from "../lib/format";

export function MedCard({
  med,
  L,
  isOwner,
  categoryName,
  onQuickWithdraw,
  onAddBatch,
  onWithdrawCustom,
  onHistory,
  onEdit,
  onDeleteBatch,
  onAdjustBatchQty,
  onDeleteMed,
}) {
  // "متوفر"/"متبقية" must mean currently withdrawable, never raw physical
  // stock — a medication with 20 units on the shelf but all expired has 0
  // available, not 20. See lib/medications.js medAvailableQty/medExpiredQty.
  const available = medAvailableQty(med);
  const expired = medExpiredQty(med);
  const total = available + expired;
  // Zero-quantity batches are real, retained records (traceability/history)
  // but represent nothing physically on the shelf, so the shelf timeline —
  // unlike the underlying med.batches data — only shows batches you could
  // actually find here.
  const sortedBatches = med.batches
    .filter((b) => b.qty > 0)
    .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));

  return (
    <div style={styles.medCard}>
      <div style={styles.medCardHead}>
        <div>
          <div style={styles.medName}>{med.name}</div>
          <div style={styles.medCat}>{categoryName || "بدون فئة"}</div>
        </div>
        {isOwner && (
          <div style={{ display: "flex", gap: 2 }}>
            <button
              style={styles.iconBtnMuted}
              onClick={onEdit}
              title="تعديل الاسم/الفئة"
            >
              <Pencil size={14} />
            </button>
            <button
              style={styles.iconBtnMuted}
              onClick={onDeleteMed}
              title="حذف الدواء"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      <div style={styles.quickRow}>
        {isOwner && (
          <button
            style={{
              ...styles.stepBtn,
              ...(available === 0 ? styles.btnDisabled : {}),
            }}
            onClick={available > 0 ? onQuickWithdraw : undefined}
            title="سحب حبة/عينة واحدة بتاريخ اليوم المحدد أعلاه"
          >
            <Minus size={15} />
          </button>
        )}
        <div style={styles.quickQtyBox}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>{available}</span>
          <span style={{ color: "#7C918F", fontSize: 11.5 }}>
            {L.remainingUnitLabel}
          </span>
        </div>
        <button
          style={styles.iconBtnMuted}
          onClick={onHistory}
          title="السجل والتاريخ"
        >
          <History size={16} />
        </button>
      </div>

      {expired > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
            fontWeight: 700,
            color: URGENCY_STYLE.expired.fg,
            background: URGENCY_STYLE.expired.bg,
            borderRadius: 8,
            padding: "5px 8px",
          }}
        >
          <span>
            ⚠️ منتهي: {expired} {available > 0 && `· الإجمالي: ${total}`}
          </span>
        </div>
      )}

      {sortedBatches.length === 0 ? (
        <div style={styles.noBatch}>لا توجد دفعات مسجّلة</div>
      ) : (
        <div style={styles.shelfTimeline}>
          {sortedBatches.map((b) => {
            // Days until the end of the expiry MONTH (not the stored day) —
            // expiry is month/year only, so a batch is still fully valid on
            // every day of its expiry month.
            const d = daysUntilMonthEnd(b.expiry);
            const s = URGENCY_STYLE[urgency(d)];
            return (
              <div
                key={b.id}
                style={{
                  ...styles.batchChip,
                  background: s.bg,
                  color: s.fg,
                  borderColor: s.bar,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: s.bar,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 700 }}>{formatSampleQty(b.qty)}</span>
                  <span style={{ opacity: 0.85 }}>· ينتهي {formatMonthYear(b.expiry)}</span>
                  <span style={{ opacity: 0.85 }}>
                    · {d < 0 ? `منتهٍ منذ ${Math.abs(d)} يوم` : `بعد ${d} يوم`}
                  </span>
                </div>
                {isOwner && (
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button
                      style={styles.batchDeleteBtn}
                      onClick={() => onAdjustBatchQty(b.id)}
                      title="تعديل الكمية"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      style={styles.batchDeleteBtn}
                      onClick={() => onDeleteBatch(b.id)}
                      title="حذف الدفعة"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isOwner && (
        <div style={styles.medCardActions}>
          <button style={styles.secondaryBtn} onClick={onAddBatch}>
            <Plus size={14} /> {L.addBatchBtn}
          </button>
          <button
            style={{
              ...styles.secondaryBtn,
              ...(available === 0 ? styles.btnDisabled : {}),
            }}
            onClick={available > 0 ? onWithdrawCustom : undefined}
          >
            <TrendingDown size={14} /> {L.withdrawCustomBtn}
          </button>
        </div>
      )}
    </div>
  );
}

import { History, Minus, Pencil, Plus, Trash2, TrendingDown, X } from "lucide-react";
import { styles } from "../styles/styles";
import { URGENCY_STYLE } from "../constants";
import { daysUntil } from "../lib/dates";
import { medTotalQty, urgency } from "../lib/medications";

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
  onDeleteMed,
}) {
  const total = medTotalQty(med);
  const sortedBatches = [...med.batches].sort(
    (a, b) => new Date(a.expiry) - new Date(b.expiry),
  );

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
              ...(total === 0 ? styles.btnDisabled : {}),
            }}
            onClick={total > 0 ? onQuickWithdraw : undefined}
            title="سحب حبة/وحدة واحدة بتاريخ اليوم المحدد أعلاه"
          >
            <Minus size={15} />
          </button>
        )}
        <div style={styles.quickQtyBox}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>{total}</span>
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

      {sortedBatches.length === 0 ? (
        <div style={styles.noBatch}>لا توجد دفعات مسجّلة</div>
      ) : (
        <div style={styles.shelfTimeline}>
          {sortedBatches.map((b) => {
            const d = daysUntil(b.expiry);
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
                  <span style={{ fontWeight: 700 }}>{b.qty} وحدة</span>
                  <span style={{ opacity: 0.85 }}>· ينتهي {b.expiry}</span>
                  <span style={{ opacity: 0.85 }}>
                    · {d < 0 ? `منتهٍ منذ ${Math.abs(d)} يوم` : `بعد ${d} يوم`}
                  </span>
                </div>
                {isOwner && (
                  <button
                    style={styles.batchDeleteBtn}
                    onClick={() => onDeleteBatch(b.id)}
                    title="حذف الدفعة"
                  >
                    <X size={13} />
                  </button>
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
              ...(total === 0 ? styles.btnDisabled : {}),
            }}
            onClick={total > 0 ? onWithdrawCustom : undefined}
          >
            <TrendingDown size={14} /> {L.withdrawCustomBtn}
          </button>
        </div>
      )}
    </div>
  );
}

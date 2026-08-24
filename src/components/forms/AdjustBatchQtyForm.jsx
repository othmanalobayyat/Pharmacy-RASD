import { useState } from "react";
import { Check, X } from "lucide-react";
import { styles } from "../../styles/styles";
import { formatMonthYear } from "../../lib/dates";

// Quantity correction for an existing batch (e.g. a data-entry mistake),
// instead of the old delete-and-recreate workaround that silently lost
// history. The actual write + audit trail happen atomically in
// adjust_batch_qty() — see supabase/migrations/0014_batch_quantity_adjustments.sql.
// This form only does lightweight, non-authoritative client-side validation
// (required fields, non-negative integer, reject a no-op edit) so an
// obviously invalid submission never round-trips to the database — the RPC
// itself re-validates all of this regardless.
export function AdjustBatchQtyForm({ medName, batch, onSubmit, onCancel }) {
  const [newQty, setNewQty] = useState(String(batch.qty));
  const [reason, setReason] = useState("");

  const parsedQty = Number(newQty);
  const isValidQty =
    newQty.trim() !== "" && Number.isInteger(parsedQty) && parsedQty >= 0;
  const isSameQty = isValidQty && parsedQty === batch.qty;
  const hasReason = reason.trim().length > 0;
  const canSubmit = isValidQty && !isSameQty && hasReason;

  return (
    <form
      style={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(parsedQty, reason.trim());
      }}
    >
      <div style={{ fontSize: 12.5, color: "#5B6E6D", lineHeight: 1.8 }}>
        <div>
          الدواء: <strong style={{ color: "#1B2B2A" }}>{medName}</strong>
        </div>
        <div>
          تاريخ الانتهاء:{" "}
          <strong style={{ color: "#1B2B2A" }}>{formatMonthYear(batch.expiry)}</strong>
        </div>
        <div>
          الكمية الحالية: <strong style={{ color: "#1B2B2A" }}>{batch.qty}</strong>
        </div>
      </div>

      <label style={styles.label}>
        الكمية الجديدة
        <input
          type="number"
          min="0"
          step="1"
          required
          style={styles.input}
          value={newQty}
          onChange={(e) => setNewQty(e.target.value)}
        />
      </label>
      {isValidQty && isSameQty && (
        <div style={{ fontSize: 12, color: "#7C918F" }}>
          الكمية الجديدة تطابق الكمية الحالية — لا حاجة للتعديل.
        </div>
      )}

      <label style={styles.label}>
        سبب التعديل
        <input
          type="text"
          required
          style={styles.input}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="مثال: تصحيح خطأ عند إدخال الكمية"
        />
      </label>

      <div style={{ fontSize: 11.5, color: "#7C918F" }}>
        سيتم تغيير كمية هذه الدفعة فعليًا، وسيُسجَّل هذا التعديل في سجل التدقيق.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
          <X size={14} /> إلغاء
        </button>
        <button
          type="submit"
          style={{
            ...styles.primaryBtn,
            flex: 1,
            justifyContent: "center",
            ...(canSubmit ? {} : styles.btnDisabled),
          }}
          disabled={!canSubmit}
        >
          <Check size={16} /> حفظ التعديل
        </button>
      </div>
    </form>
  );
}

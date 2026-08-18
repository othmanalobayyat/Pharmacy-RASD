import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { styles } from "../../styles/styles";
import { withdrawableBatches } from "../../lib/medications";
import { formatMonthYear } from "../../lib/dates";

export function WithdrawForm({ med, sessionDate, onSubmit }) {
  // Expired batches are excluded here too (not just server-side) so the
  // dropdown never offers a choice the withdraw_stock RPC would reject.
  const sortedBatches = withdrawableBatches(med);
  const [batchId, setBatchId] = useState(sortedBatches[0]?.id || "");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(sessionDate);
  const selectedBatch = med.batches.find((b) => b.id === batchId);

  if (sortedBatches.length === 0) {
    return (
      <div style={{ padding: "8px 4px", color: "#7C918F" }}>
        لا يوجد مخزون صالح للصرف لهذا الدواء.
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (batchId && Number(qty) > 0) onSubmit(batchId, qty, date);
      }}
      style={styles.form}
    >
      <label style={styles.label}>
        الدفعة
        <div style={styles.selectWrap}>
          <select
            style={styles.select}
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            {sortedBatches.map((b) => (
              <option key={b.id} value={b.id}>
                ينتهي {formatMonthYear(b.expiry)} — متوفر {b.qty}
              </option>
            ))}
          </select>
          <ChevronDown size={15} style={styles.selectChevron} />
        </div>
      </label>
      <label style={styles.label}>
        الكمية المصروفة
        <input
          type="number"
          min="1"
          max={selectedBatch?.qty || 1}
          style={styles.input}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </label>
      <label style={styles.label}>
        التاريخ
        <input
          type="date"
          style={styles.input}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <button type="submit" style={styles.primaryBtn}>
        <Check size={16} /> تأكيد الصرف
      </button>
    </form>
  );
}

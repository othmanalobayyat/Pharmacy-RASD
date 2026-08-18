import { useState } from "react";
import { Check } from "lucide-react";
import { styles } from "../../styles/styles";
import { monthInputToISO } from "../../lib/dates";

export function AddBatchForm({ onSubmit }) {
  // Expiry is month/year only (business rule) — a native month input never
  // lets the user pick a day, and the value is converted to the day-01 ISO
  // date this app stores (see lib/dates.js monthInputToISO) only at submit
  // time, so the rest of the app keeps working with a plain ISO date string.
  const [expiryMonth, setExpiryMonth] = useState("");
  const [qty, setQty] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ expiry: monthInputToISO(expiryMonth), qty });
      }}
      style={styles.form}
    >
      <label style={styles.label}>
        شهر/سنة انتهاء الصلاحية
        <input
          type="month"
          style={styles.input}
          value={expiryMonth}
          onChange={(e) => setExpiryMonth(e.target.value)}
          required
        />
      </label>
      <label style={styles.label}>
        الكمية في هذه الدفعة
        <input
          type="number"
          min="0"
          style={styles.input}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="مثال: 10"
          required
        />
      </label>
      <button type="submit" style={styles.primaryBtn}>
        <Check size={16} /> إضافة الدفعة
      </button>
    </form>
  );
}

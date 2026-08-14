import { useState } from "react";
import { Check } from "lucide-react";
import { styles } from "../../styles/styles";

export function AddBatchForm({ onSubmit }) {
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ expiry, qty });
      }}
      style={styles.form}
    >
      <label style={styles.label}>
        تاريخ انتهاء الدفعة
        <input
          type="date"
          style={styles.input}
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
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

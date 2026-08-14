import { useState } from "react";
import { Check } from "lucide-react";
import { styles } from "../../styles/styles";

export function SimpleForm({ fields, submitLabel, onSubmit, initial }) {
  const [values, setValues] = useState(initial || {});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      style={styles.form}
    >
      {fields.map((f) => (
        <label key={f.key} style={styles.label}>
          {f.label}
          <input
            type={f.type || "text"}
            placeholder={f.placeholder}
            style={styles.input}
            value={values[f.key] ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.key]: e.target.value }))
            }
          />
        </label>
      ))}
      <button type="submit" style={styles.primaryBtn}>
        <Check size={16} /> {submitLabel}
      </button>
    </form>
  );
}

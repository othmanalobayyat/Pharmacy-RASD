import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { styles } from "../../styles/styles";

export function AddMedForm({ categories, onSubmit, initial, submitLabel }) {
  const [name, setName] = useState(initial?.name || "");
  // A NEW medication starts with no category — the user must explicitly
  // choose one (never categories[0], which silently picked whichever
  // category happened to sort first). Editing an existing medication still
  // preserves its current category via `initial`.
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [submitted, setSubmitted] = useState(false);

  const showCategoryError = submitted && !categoryId;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (!name.trim() || !categoryId) return;
        onSubmit({ name, categoryId });
      }}
      style={styles.form}
    >
      <label style={styles.label}>
        اسم الدواء
        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: بنادول"
        />
      </label>
      <label style={styles.label}>
        الفئة
        <div style={styles.selectWrap}>
          <select
            style={styles.select}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="" disabled>
              اختر الفئة
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} style={styles.selectChevron} />
        </div>
        {showCategoryError && (
          <span style={{ color: "#9A2E23", fontSize: 12, fontWeight: 400 }}>
            الرجاء اختيار الفئة.
          </span>
        )}
      </label>
      <button type="submit" style={styles.primaryBtn}>
        <Check size={16} /> {submitLabel || "إضافة الدواء"}
      </button>
    </form>
  );
}

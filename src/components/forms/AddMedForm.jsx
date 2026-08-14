import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { styles } from "../../styles/styles";

export function AddMedForm({ categories, onSubmit, initial, submitLabel }) {
  const [name, setName] = useState(initial?.name || "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId || categories[0]?.id || "",
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
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
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} style={styles.selectChevron} />
        </div>
      </label>
      <button type="submit" style={styles.primaryBtn}>
        <Check size={16} /> {submitLabel || "إضافة الدواء"}
      </button>
    </form>
  );
}

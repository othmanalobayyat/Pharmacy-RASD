import { useState } from "react";
import { Download, X } from "lucide-react";
import { styles } from "../../styles/styles";
import { todayISO } from "../../lib/dates";
import { EXPORT_FIELDS, buildExportTable, rowsToCsv, downloadCsvFile } from "../../lib/exportMedications";

const REQUIRED_KEYS = new Set(EXPORT_FIELDS.filter((f) => f.required).map((f) => f.key));

// Data Sharing / "Export Medication Stock" column picker — lets the user
// choose which optional columns to include before generating the file.
// "name" is always on and its checkbox is always disabled (see the
// `required` flag on EXPORT_FIELDS in lib/exportMedications.js, the single
// source of truth for both the field list AND its fixed column order).
//
// Generation is entirely client-side (buildExportTable() -> rowsToCsv() ->
// downloadCsvFile(), all pure/DOM-only helpers) — no network call, nothing
// uploaded to Supabase Storage, nothing written to any database table.
export function ExportMedsForm({ medications, categories, onCancel, onExported }) {
  const [selected, setSelected] = useState(() => new Set(REQUIRED_KEYS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (key) => {
    if (REQUIRED_KEYS.has(key)) return; // name can never be deselected
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasNothingToExport = medications.length === 0;
  const canExport = !busy && !hasNothingToExport;

  const handleExport = async () => {
    if (!canExport) return;
    setError("");
    setBusy(true);
    try {
      const selectedKeys = EXPORT_FIELDS.filter((f) => selected.has(f.key)).map((f) => f.key);
      const referenceISO = todayISO();
      const { headers, rows } = buildExportTable(medications, categories, selectedKeys, referenceISO);
      const csv = rowsToCsv(headers, rows);
      downloadCsvFile(`pharmacy-rasd-medications-${referenceISO}.csv`, csv);
      onExported();
    } catch {
      setError("تعذر إنشاء ملف التصدير. حاول مرة أخرى.");
      setBusy(false);
    }
  };

  return (
    <div style={styles.form}>
      <div style={styles.exportIntro}>
        اختر الأعمدة المطلوبة في ملف التصدير. سيتم إنشاء الملف وتنزيله مباشرة على
        جهازك.
      </div>

      <div style={styles.exportFieldsList}>
        {EXPORT_FIELDS.map((f, i) => {
          const required = f.required;
          const checked = required || selected.has(f.key);
          return (
            <label
              key={f.key}
              style={{
                ...styles.exportFieldRow,
                ...(i === EXPORT_FIELDS.length - 1 ? styles.exportFieldRowLast : {}),
              }}
            >
              <input
                type="checkbox"
                style={styles.exportFieldCheckbox}
                checked={checked}
                disabled={required}
                onChange={() => toggle(f.key)}
              />
              {f.label}
              {required && <span style={styles.exportFieldRequiredTag}>مطلوب</span>}
            </label>
          );
        })}
      </div>

      {hasNothingToExport && (
        <div style={styles.exportEmptyNote}>
          لا يوجد أدوية في العرض الحالي لتصديرها.
        </div>
      )}
      {error && <div style={styles.authError}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
          <X size={14} /> إلغاء
        </button>
        <button
          type="button"
          style={{
            ...styles.primaryBtn,
            flex: 1,
            justifyContent: "center",
            ...(canExport ? {} : styles.btnDisabled),
          }}
          disabled={!canExport}
          onClick={handleExport}
        >
          <Download size={16} /> {busy ? "جارٍ إنشاء الملف…" : "تصدير"}
        </button>
      </div>
    </div>
  );
}

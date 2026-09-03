import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { styles } from "../../styles/styles";

const NOT_SET = "غير محدد";

// One profile field (full name / job title) with its own independent
// read-only <-> edit state — clicking its pencil never affects any other
// field. `onSave` is expected to persist BOTH the current committed values
// of full name and job title together (the underlying update_own_profile()
// RPC always writes both columns) — ProfilePage's callers already close
// over the other field's current value, so this component only ever needs
// to know about its own.
export function EditableProfileField({ icon, label, value, required = false, placeholder, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setDraft(value ?? "");
    setError("");
    setSuccess(false);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setError("");
    setEditing(false);
  };

  const save = async () => {
    setError("");
    const trimmed = draft.trim();
    if (required && trimmed === "") {
      setError(`${label} مطلوب ولا يمكن أن يكون فارغًا.`);
      return;
    }
    setBusy(true);
    try {
      await onSave(trimmed);
      setEditing(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1800);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const displayValue = value?.trim() ? value : NOT_SET;

  return (
    <div style={styles.profileInfoRow}>
      <span style={styles.profileInfoIcon}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={styles.profileInfoLabel}>{label}</div>

        {editing ? (
          <div style={styles.profileEditRow}>
            <input
              style={styles.profileEditInput}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              autoFocus
              disabled={busy}
              aria-label={label}
            />
            <div style={styles.profileEditActions}>
              <button
                type="button"
                style={styles.profileEditBtnSave}
                onClick={save}
                disabled={busy}
                aria-label={`حفظ ${label}`}
                title="حفظ"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                style={styles.profileEditBtnCancel}
                onClick={cancel}
                disabled={busy}
                aria-label={`إلغاء تعديل ${label}`}
                title="إلغاء"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.profileValueRow}>
            <span style={styles.profileInfoValue}>{displayValue}</span>
            <button
              type="button"
              style={styles.profileEditPencilBtn}
              onClick={startEdit}
              aria-label={`تعديل ${label}`}
              title={`تعديل ${label}`}
            >
              <Pencil size={13} />
            </button>
          </div>
        )}

        {error && (
          <div role="alert" style={styles.profileFieldError}>
            {error}
          </div>
        )}
        {success && <div style={styles.profileFieldSuccess}>تم الحفظ بنجاح.</div>}
      </div>
    </div>
  );
}

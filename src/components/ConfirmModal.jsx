import { AlertTriangle, Trash2, X } from "lucide-react";
import { styles } from "../styles/styles";
import { Modal } from "./Modal";

// Safety-net confirmation for destructive actions (delete medication/batch/
// first-aid item). The database remains the real integrity boundary (FK
// behavior, historical log preservation) — this is purely a UX guard against
// an accidental click; it does not change what's allowed, only whether an
// intended deletion actually proceeds immediately or waits for a second tap.
export function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          color: "#3A4E4C",
          fontSize: 13.5,
          lineHeight: 1.6,
        }}
      >
        <AlertTriangle size={18} color="#C4453B" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>{message}</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button style={styles.secondaryBtn} onClick={onCancel}>
          <X size={14} /> إلغاء
        </button>
        <button
          style={{ ...styles.primaryBtn, flex: 1, justifyContent: "center", background: "#C4453B" }}
          onClick={onConfirm}
        >
          <Trash2 size={14} /> {confirmLabel || "حذف"}
        </button>
      </div>
    </Modal>
  );
}

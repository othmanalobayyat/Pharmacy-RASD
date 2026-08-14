import { X } from "lucide-react";
import { styles } from "../styles/styles";

export function Modal({ title, onClose, children, wide }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={{
          ...styles.modalBox,
          maxWidth: wide ? "min(560px, 94vw)" : "min(380px, 94vw)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.modalHead}>
          <span style={{ fontWeight: 700, color: "#1B2B2A" }}>{title}</span>
          <button style={styles.iconBtnMuted} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

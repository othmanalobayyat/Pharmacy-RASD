import { styles } from "../styles/styles";
import { URGENCY_STYLE } from "../constants";

// Renders as a real <button> when `onClick` is given (keyboard-focusable,
// Enter/Space activate it natively, and the existing global
// `button:focus-visible` outline in styles/global.css applies automatically
// — no custom keyboard handling needed) — otherwise a plain, non-interactive
// <div>, so this stays a safe drop-in for any future non-clickable use.
export function Kpi({ icon, value, label, tone, onClick }) {
  const c = URGENCY_STYLE[tone] || URGENCY_STYLE.ok;
  const interactive = typeof onClick === "function";
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      className={interactive ? "kpi-card kpi-card-clickable" : "kpi-card"}
      style={{
        ...styles.kpi,
        background: c.bg,
        color: c.fg,
        ...(interactive ? styles.kpiClickable : {}),
      }}
      onClick={onClick}
      aria-label={interactive ? `${label}: ${value}` : undefined}
    >
      <div style={styles.kpiIconWrap}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={styles.kpiValue}>{value}</div>
        <div style={styles.kpiLabel}>{label}</div>
      </div>
    </Tag>
  );
}

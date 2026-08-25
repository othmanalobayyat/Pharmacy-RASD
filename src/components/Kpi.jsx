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
        // A shared thin accent border (each card's own tone color) ties all
        // five cards together as one coherent set, matching the rest of the
        // app's bordered-card language, instead of relying on flat fills
        // alone to feel "designed as a system." Applied last so it always
        // wins over kpiClickable's button-reset `border: none`.
        border: `1px solid ${c.bar}`,
      }}
      onClick={onClick}
      aria-label={interactive ? `${label}: ${value}` : undefined}
    >
      <div className="kpi-icon-wrap" style={styles.kpiIconWrap}>
        {icon}
      </div>
      <div className="kpi-text-wrap" style={{ minWidth: 0 }}>
        <div className="kpi-value" style={styles.kpiValue}>
          {value}
        </div>
        <div className="kpi-label" style={styles.kpiLabel}>
          {label}
        </div>
      </div>
    </Tag>
  );
}

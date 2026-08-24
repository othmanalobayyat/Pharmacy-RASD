import { styles } from "../styles/styles";
import { URGENCY_STYLE } from "../constants";

export function Kpi({ icon, value, label, tone }) {
  const c = URGENCY_STYLE[tone] || URGENCY_STYLE.ok;
  return (
    <div className="kpi-card" style={{ ...styles.kpi, background: c.bg, color: c.fg }}>
      <div style={styles.kpiIconWrap}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={styles.kpiValue}>{value}</div>
        <div style={styles.kpiLabel}>{label}</div>
      </div>
    </div>
  );
}

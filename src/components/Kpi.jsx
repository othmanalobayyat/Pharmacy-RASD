import { styles } from "../styles/styles";
import { URGENCY_STYLE } from "../constants";

export function Kpi({ icon, value, label, tone }) {
  const c = URGENCY_STYLE[tone] || URGENCY_STYLE.ok;
  return (
    <div style={{ ...styles.kpi, background: c.bg, color: c.fg }}>
      {icon}
      <div>
        <div style={styles.kpiValue}>{value}</div>
        <div style={styles.kpiLabel}>{label}</div>
      </div>
    </div>
  );
}

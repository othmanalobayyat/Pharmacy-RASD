import { Package } from "lucide-react";
import { styles } from "../styles/styles";

export function EmptyState({ title, subtitle }) {
  return (
    <div style={styles.emptyState}>
      <Package size={32} color="#B7C7C5" />
      <div style={{ fontWeight: 700, color: "#3A4E4C", marginTop: 10 }}>
        {title}
      </div>
      <div style={{ color: "#7C918F", fontSize: 13, marginTop: 4 }}>
        {subtitle}
      </div>
    </div>
  );
}

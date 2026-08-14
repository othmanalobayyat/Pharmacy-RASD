import { styles } from "../styles/styles";

export function TabButton({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={styles.tabBtn(active)}>
      {label}
    </button>
  );
}

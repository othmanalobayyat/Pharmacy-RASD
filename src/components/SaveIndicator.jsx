import { styles } from "../styles/styles";

// Adapted from the pre-Supabase debounced-localStorage-save indicator to
// reflect real network operations. There's no generic "retry" anymore —
// cloud mutations aren't safely re-playable blind (re-clicking "add" would
// create a duplicate), so a failure just surfaces the actual error and the
// user retries by redoing the action.
export function SaveIndicator({ status, error }) {
  if (status === "idle") return null;
  if (status === "saving")
    return <div style={styles.saveInfo}>جارٍ الحفظ على السحابة…</div>;
  return (
    <div style={styles.saveError}>
      تعذّر حفظ آخر تعديل{error ? `: ${error}` : ""}. حاول تنفيذ العملية مرة
      أخرى.
    </div>
  );
}

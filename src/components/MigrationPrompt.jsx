import { useState } from "react";
import { Check, Database, X } from "lucide-react";
import { styles } from "../styles/styles";
import { migrateLegacyDataToSupabase } from "../lib/migrateLegacyData";

// Shown only to an admin when this browser still has pre-Supabase
// localStorage data and the clinic's cloud data is empty. Never runs
// automatically — migration only ever happens on an explicit click, and the
// original localStorage entry is never deleted, migration succeeds or not.
export function MigrationPrompt({ clinicId, onDismiss, onMigrated }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const runMigration = async () => {
    setBusy(true);
    setError("");
    try {
      const outcome = await migrateLegacyDataToSupabase(clinicId);
      setResult(outcome);
      if (outcome.migrated) onMigrated?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.saveInfo /* reuse the muted banner look */}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Database size={15} />
        {result?.migrated ? (
          <span>
            تم النقل بنجاح: {result.counts.medications} دواء،{" "}
            {result.counts.batches} دفعة، {result.counts.firstAid} مادة إسعاف،{" "}
            {result.counts.log} سجل صرف.
          </span>
        ) : (
          <span>
            وجدنا بيانات صيدلية محفوظة على هذا الجهاز من قبل. تحب تنقلها إلى
            قاعدة البيانات المشتركة للعيادة؟
          </span>
        )}
        {error && <span style={{ color: "#9A2E23" }}>{error}</span>}
        {!result?.migrated && (
          <>
            <button
              style={{ ...styles.secondaryBtn, flex: "none" }}
              onClick={runMigration}
              disabled={busy}
            >
              <Check size={13} /> {busy ? "جارٍ النقل…" : "نقل البيانات الآن"}
            </button>
            <button
              style={{ ...styles.iconBtnMuted }}
              onClick={onDismiss}
              title="إخفاء"
              disabled={busy}
            >
              <X size={15} />
            </button>
          </>
        )}
        {result?.migrated && (
          <button style={{ ...styles.iconBtnMuted }} onClick={onDismiss} title="إغلاق">
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

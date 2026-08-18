import { useState, useEffect, useCallback } from "react";
import { styles } from "../styles/styles";
import { URGENCY_STYLE } from "../constants";
import { daysAgoLabel, formatMonthYear, todayISO } from "../lib/dates";
import { medAvailableQty, medExpiredQty } from "../lib/medications";
import { fetchMedicationLog } from "../lib/pharmacyApi";

// This medication's own withdrawal history is fetched directly from the
// database, not filtered out of the app's global withdrawal-log state — that
// global log is paginated (Improvement #7) and normally only holds its most
// recent page, so filtering it here would silently make older withdrawals
// of THIS medication disappear from its own history. `refreshSignal`
// (bumped by usePharmacyData on every load/refetch, including realtime
// updates) re-triggers this fetch so the view stays live while open.
export function MedHistory({ med, refreshSignal }) {
  const [range, setRange] = useState("7");
  const [medLog, setMedLog] = useState(null);
  const [logError, setLogError] = useState("");

  const loadLog = useCallback(() => {
    setLogError("");
    fetchMedicationLog(med.id)
      .then(setMedLog)
      .catch((e) => setLogError(e.message));
  }, [med.id]);

  useEffect(() => {
    loadLog();
  }, [loadLog, refreshSignal]);

  // "المتبقي الآن" means currently withdrawable, not raw physical stock —
  // same rule as MedCard (see lib/medications.js medAvailableQty).
  const available = medAvailableQty(med);
  const expired = medExpiredQty(med);

  if (logError) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          padding: "20px 4px",
        }}
      >
        <div style={{ color: "#9A2E23", fontSize: 13, textAlign: "center" }}>
          {logError}
        </div>
        <button style={styles.primaryBtn} onClick={loadLog}>
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (medLog === null) {
    return (
      <div style={{ color: "#7C918F", fontSize: 13, padding: "20px 4px", textAlign: "center" }}>
        جارٍ التحميل…
      </div>
    );
  }

  const cutoff = (() => {
    if (range === "all") return null;
    const d = new Date(todayISO());
    d.setDate(d.getDate() - Number(range));
    return d.toISOString().slice(0, 10);
  })();
  const filteredLog = cutoff ? medLog.filter((l) => l.date >= cutoff) : medLog;
  const periodTotal = filteredLog.reduce((sum, l) => sum + l.qty, 0);

  return (
    <div>
      <div style={styles.historySummaryRow}>
        <div style={styles.historySummaryBox}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#145C5C" }}>
            {available}
          </div>
          <div style={{ fontSize: 11.5, color: "#7C918F" }}>المتبقي الآن</div>
        </div>
        <div style={styles.historySummaryBox}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#145C5C" }}>
            {periodTotal}
          </div>
          <div style={{ fontSize: 11.5, color: "#7C918F" }}>
            مصروف بالفترة المحددة
          </div>
        </div>
        {expired > 0 && (
          <div style={styles.historySummaryBox}>
            <div style={{ fontSize: 20, fontWeight: 800, color: URGENCY_STYLE.expired.fg }}>
              {expired}
            </div>
            <div style={{ fontSize: 11.5, color: "#7C918F" }}>⚠️ منتهي</div>
          </div>
        )}
      </div>
      <div style={styles.rangeChips}>
        {[
          ["7", "آخر ٧ أيام"],
          ["30", "آخر ٣٠ يوم"],
          ["all", "كل الفترة"],
        ].map(([val, label]) => (
          <button
            key={val}
            style={styles.rangeChip(range === val)}
            onClick={() => setRange(val)}
          >
            {label}
          </button>
        ))}
      </div>
      {filteredLog.length === 0 ? (
        <div style={{ color: "#7C918F", fontSize: 13, padding: "18px 4px" }}>
          لا يوجد عمليات صرف بهذه الفترة.
        </div>
      ) : (
        <div style={styles.logTableWrap}>
          <table style={styles.logTable}>
            <thead>
              <tr>
                <th style={styles.th}>التاريخ</th>
                <th style={styles.th}>الكمية</th>
                <th style={styles.th}>الدفعة (تنتهي)</th>
                <th style={styles.th}>بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {filteredLog.map((l) => (
                <tr key={l.id}>
                  <td style={styles.td}>
                    {l.date}{" "}
                    <span style={{ color: "#B7C7C5", fontSize: 11 }}>
                      ({daysAgoLabel(l.date)})
                    </span>
                  </td>
                  <td style={styles.td}>{l.qty}</td>
                  <td style={styles.td}>{l.expiry ? formatMonthYear(l.expiry) : "—"}</td>
                  <td style={{ ...styles.td, color: "#7C918F" }}>
                    {l.performedByEmail || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

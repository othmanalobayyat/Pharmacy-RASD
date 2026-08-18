import { useState } from "react";
import { styles } from "../styles/styles";
import { URGENCY_STYLE } from "../constants";
import { daysAgoLabel, formatMonthYear, todayISO } from "../lib/dates";
import { medAvailableQty, medExpiredQty } from "../lib/medications";

export function MedHistory({ med, log }) {
  const [range, setRange] = useState("7");
  // "المتبقي الآن" means currently withdrawable, not raw physical stock —
  // same rule as MedCard (see lib/medications.js medAvailableQty).
  const available = medAvailableQty(med);
  const expired = medExpiredQty(med);
  const medLog = log
    .filter((l) => l.medId === med.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
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

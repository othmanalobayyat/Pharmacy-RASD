import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, History } from "lucide-react";
import { styles } from "../styles/styles";
import { EmptyState } from "./EmptyState";
import { fetchWithdrawalLogForDate } from "../lib/pharmacyApi";
import { addDays, formatMonthYear, todayISO } from "../lib/dates";

// "سجل الصرف اليومي" — a focused daily view on top of the SAME
// withdrawal_logs data "سجل الصرف" (LogSection.jsx) already shows, not a
// second data source. Unlike the global log (which only ever holds its most
// recently loaded page — see pharmacyApi.js fetchWithdrawalLogPage), this
// queries the database directly for the exact selected date
// (fetchWithdrawalLogForDate), the same "self-fetch a scoped slice" pattern
// MedHistory.jsx already uses for a single medication's history — so
// picking an older date always shows the real data for that day, never a
// silently-incomplete/empty result just because it wasn't in the loaded
// page. `refreshSignal` (bumped by usePharmacyData on every load/refetch,
// including realtime-triggered ones) re-triggers this fetch, reusing the
// app's existing single Realtime subscription — no second one is created.
export function DailyLogView({ refreshSignal }) {
  const [date, setDate] = useState(todayISO());
  const [log, setLog] = useState(null); // null = loading
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    fetchWithdrawalLogForDate(date)
      .then(setLog)
      .catch((e) => setError(e.message));
  }, [date]);

  useEffect(() => {
    setLog(null);
    load();
  }, [load, refreshSignal]);

  const opsCount = log?.length ?? 0;
  const totalUnits = (log || []).reduce((sum, l) => sum + l.qty, 0);
  const isToday = date === todayISO();

  return (
    <main className="pharmacy-main" style={{ ...styles.main, width: "100%" }}>
      <div style={styles.toolbar}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#5B6E6D",
              fontSize: 13.5,
            }}
          >
            <History size={16} /> سجل الصرف اليومي
          </div>
          <div style={{ fontSize: 11.5, color: "#9AAFAD" }}>
            عرض عمليات صرف الأدوية حسب التاريخ
          </div>
        </div>
      </div>

      <div style={styles.sessionBar}>
        <CalendarDays size={16} color="#145C5C" />
        <button
          style={styles.iconBtnMuted}
          onClick={() => setDate((d) => addDays(d, -1))}
          title="اليوم السابق"
        >
          <ChevronRight size={16} />
        </button>
        <input
          type="date"
          style={styles.sessionInput}
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <button
          style={styles.iconBtnMuted}
          onClick={() => setDate((d) => addDays(d, 1))}
          title="اليوم التالي"
        >
          <ChevronLeft size={16} />
        </button>
        {!isToday && (
          <button
            style={{ ...styles.secondaryBtn, flex: "none" }}
            onClick={() => setDate(todayISO())}
          >
            اليوم
          </button>
        )}
      </div>

      {error ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            padding: "20px 4px",
          }}
        >
          <div style={{ color: "#9A2E23", fontSize: 13, textAlign: "center" }}>{error}</div>
          <button style={styles.primaryBtn} onClick={load}>
            إعادة المحاولة
          </button>
        </div>
      ) : log === null ? (
        <div style={{ color: "#7C918F", fontSize: 13, padding: "20px 4px", textAlign: "center" }}>
          جارٍ التحميل…
        </div>
      ) : (
        <>
          <div style={styles.historySummaryRow}>
            <div style={styles.historySummaryBox}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#145C5C" }}>{opsCount}</div>
              <div style={{ fontSize: 11.5, color: "#7C918F" }}>عدد عمليات الصرف</div>
            </div>
            <div style={styles.historySummaryBox}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#145C5C" }}>{totalUnits}</div>
              <div style={{ fontSize: 11.5, color: "#7C918F" }}>إجمالي العينات المصروفة</div>
            </div>
          </div>

          {log.length === 0 ? (
            <EmptyState
              title="لا توجد عمليات صرف لهذا اليوم"
              subtitle="لم يتم تسجيل أي عملية صرف في التاريخ المحدد."
            />
          ) : (
            <div style={styles.logTableWrap}>
              <table style={styles.logTable}>
                <thead>
                  <tr>
                    <th style={styles.th}>الوقت</th>
                    <th style={styles.th}>الدواء</th>
                    <th style={styles.th}>الكمية المصروفة</th>
                    <th style={styles.th}>من دفعة تنتهي في</th>
                    <th style={styles.th}>بواسطة</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((l) => (
                    <tr key={l.id}>
                      <td style={styles.td}>
                        {l.createdAt
                          ? new Date(l.createdAt).toLocaleTimeString("ar", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{l.medName}</td>
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
        </>
      )}
    </main>
  );
}

import { History } from "lucide-react";
import { styles } from "../styles/styles";
import { formatMonthYear } from "../lib/dates";
import { EmptyState } from "./EmptyState";

export function LogSection({
  L,
  log,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
}) {
  return (
    <main className="pharmacy-main" style={{ ...styles.main, width: "100%" }}>
      <div style={styles.toolbar}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#5B6E6D",
            fontSize: 13.5,
          }}
        >
          <History size={16} /> {L.logTitle}
        </div>
      </div>
      {log.length === 0 ? (
        <EmptyState
          title="لا يوجد سجلّ بعد"
          subtitle="كل عملية صرف رح تنسجل هون تلقائيًا."
        />
      ) : (
        <div style={styles.logTableWrap}>
          <table style={styles.logTable}>
            <thead>
              <tr>
                <th style={styles.th}>التاريخ</th>
                <th style={styles.th}>الدواء</th>
                <th style={styles.th}>الكمية المصروفة</th>
                <th style={styles.th}>من دفعة تنتهي في</th>
                <th style={styles.th}>بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td style={styles.td}>{l.date}</td>
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
      {log.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
          }}
        >
          {loadMoreError && (
            <div style={{ color: "#9A2E23", fontSize: 12.5, textAlign: "center" }}>
              {loadMoreError}
            </div>
          )}
          {hasMore ? (
            <button
              style={{ ...styles.secondaryBtn, flex: "none" }}
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "جارٍ التحميل…" : loadMoreError ? "إعادة المحاولة" : "تحميل المزيد"}
            </button>
          ) : (
            <div style={{ color: "#B7C7C5", fontSize: 12 }}>
              لا يوجد المزيد من السجلات
            </div>
          )}
        </div>
      )}
    </main>
  );
}

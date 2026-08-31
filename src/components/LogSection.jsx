import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { styles } from "../styles/styles";
import { EmptyState } from "./EmptyState";
import { fetchAllWithdrawalLogs } from "../lib/pharmacyApi";
import { formatFullDate, formatMonthYear } from "../lib/dates";
import { formatSampleQty } from "../lib/format";

function formatTime(createdAt) {
  if (!createdAt) return null;
  return new Date(createdAt).toLocaleTimeString("ar", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "سجل الصرف" — the full withdrawal history, GROUPED BY MEDICATION so a
// frequently-dispensed medication doesn't repeat itself as dozens of
// separate rows. Each medication appears once, as one row in a single data
// table; clicking it expands an inline nested table with every individual
// withdrawal record for that medication (no navigation, no modal — this is
// a presentation-only redesign of the same grouped data the previous
// card+modal version showed).
//
// This is a different screen from "سجل الصرف اليومي" (DailyLogView.jsx,
// unchanged) — that one is a focused single-day view; this one is the full
// history, just reorganized for readability.
//
// Self-fetches the full withdrawal_logs table (see
// pharmacyApi.js fetchAllWithdrawalLogs for why an accurate per-medication
// count needs every row, not the paginated global window), the same
// self-fetch-a-scoped-dataset pattern MedHistory.jsx/DailyLogView.jsx
// already use. `refreshSignal` (bumped by usePharmacyData on every load/
// refetch, including realtime-triggered ones) re-triggers this fetch,
// reusing the app's existing single Realtime subscription.
export function LogSection({ L, refreshSignal }) {
  const [rows, setRows] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());

  const load = useCallback(() => {
    setError("");
    fetchAllWithdrawalLogs()
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setRows(null);
    load();
  }, [load, refreshSignal]);

  // Grouping logic is UNCHANGED from the previous version — only how it's
  // rendered below has changed. Grouped by medication identity:
  // medication_id when the medication still exists, falling back to the
  // snapshotted medication NAME only for rows whose medication was later
  // deleted (medication_id is nullable — "on delete set null", see
  // supabase/migrations/0001_schema.sql, so deleting a medication never
  // destroys its withdrawal history). The "id:"/"name:" prefixes keep the
  // two kinds of keys from ever colliding, so a deleted medication's
  // history can never get merged into an unrelated LIVE medication that
  // happens to share the same name.
  //
  // `rows` is already newest-first (fetchAllWithdrawalLogs orders by
  // created_at desc), so each group's `records` list is already
  // newest-first too — no re-sort needed for the expanded details.
  const groups = useMemo(() => {
    if (!rows) return [];
    const map = new Map();
    for (const r of rows) {
      const key = r.medId ? `id:${r.medId}` : `name:${r.medName}`;
      let g = map.get(key);
      if (!g) {
        g = { key, medName: r.medName, count: 0, totalQty: 0, lastAt: r.createdAt, records: [] };
        map.set(key, g);
      }
      g.count += 1;
      g.totalQty += r.qty;
      if (r.createdAt && (!g.lastAt || r.createdAt > g.lastAt)) g.lastAt = r.createdAt;
      g.records.push(r);
    }
    return [...map.values()].sort((a, b) => ((a.lastAt || "") < (b.lastAt || "") ? 1 : -1));
  }, [rows]);

  const toggleExpanded = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
      ) : rows === null ? (
        <div style={{ color: "#7C918F", fontSize: 13, padding: "20px 4px", textAlign: "center" }}>
          جارٍ التحميل…
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="لا توجد عمليات صرف مسجلة"
          subtitle="كل عملية صرف رح تنسجل هون تلقائيًا."
        />
      ) : (
        <div style={styles.logTableWrap}>
          <table className="log-main-table" style={{ ...styles.logTable, minWidth: 0 }}>
            <thead>
              <tr>
                <th style={styles.th}>الدواء</th>
                <th style={styles.th}>عدد مرات الصرف</th>
                <th style={styles.th}>إجمالي الكمية المصروفة</th>
                <th style={styles.th}>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = expandedKeys.has(g.key);
                return (
                  <Fragment key={g.key}>
                    <tr
                      className="log-group-row"
                      style={styles.logGroupRow}
                      onClick={() => toggleExpanded(g.key)}
                    >
                      <td style={{ ...styles.td, ...styles.logGroupNameCell }}>{g.medName}</td>
                      <td style={styles.td}>{g.count}</td>
                      <td style={styles.td}>{formatSampleQty(g.totalQty)}</td>
                      <td style={styles.td}>
                        <button
                          type="button"
                          style={styles.logExpandBtn}
                          aria-label={isOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(g.key);
                          }}
                        >
                          {/* Hidden (icon-only) on narrow phones via CSS —
                              the button keeps its aria-label regardless, so
                              the action stays accessible either way. */}
                          <span className="log-expand-btn-label">
                            {isOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                          </span>
                          <ChevronDown
                            size={14}
                            style={{
                              transform: isOpen ? "rotate(180deg)" : "none",
                              transition: "transform 0.15s",
                            }}
                          />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={4} style={styles.logDetailsCell}>
                          <div style={styles.logDetailsWrap}>
                            <div style={styles.logDetailsTitle}>
                              تفاصيل صرف {g.medName}
                            </div>
                            <div style={{ ...styles.logTableWrap, border: "1px solid #E4EEEC" }}>
                              <table style={styles.logTable}>
                                <thead>
                                  <tr>
                                    <th style={styles.th}>التاريخ</th>
                                    <th style={styles.th}>الوقت</th>
                                    <th style={styles.th}>الكمية</th>
                                    <th style={styles.th}>تاريخ الانتهاء</th>
                                    <th style={styles.th}>بواسطة</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.records.map((l) => (
                                    <tr key={l.id}>
                                      <td style={styles.td}>{formatFullDate(l.date)}</td>
                                      <td style={styles.td}>{formatTime(l.createdAt) || "—"}</td>
                                      <td style={styles.td}>{l.qty}</td>
                                      <td style={styles.td}>
                                        {l.expiry ? formatMonthYear(l.expiry) : "—"}
                                      </td>
                                      <td style={{ ...styles.td, color: "#7C918F" }}>
                                        {l.performedByEmail || "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

import { Pencil, Plus, Trash2 } from "lucide-react";
import { styles } from "../styles/styles";
import { URGENCY_STYLE } from "../constants";
import { EmptyState } from "./EmptyState";

export function FirstAidSection({
  L,
  isOwner,
  items,
  onAdd,
  onAdjust,
  onDelete,
  onEdit,
}) {
  return (
    <main className="pharmacy-main" style={{ ...styles.main, width: "100%" }}>
      <div style={styles.toolbar}>
        <div style={{ color: "#5B6E6D", fontSize: 13.5 }}>
          {L.firstAidIntro}
        </div>
        {isOwner && (
          <button style={styles.primaryBtn} onClick={onAdd}>
            <Plus size={16} /> {L.addFirstAidBtn}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="لا يوجد مواد إسعاف مسجّلة"
          subtitle="أضف أول مادة مثل الشاش أو الضمادات."
        />
      ) : (
        <div style={styles.medGrid}>
          {items.map((it) => {
            const low = it.qty <= it.threshold;
            return (
              <div key={it.id} style={styles.medCard}>
                <div style={styles.medCardHead}>
                  <div style={styles.medName}>{it.name}</div>
                  {isOwner && (
                    <div style={{ display: "flex", gap: 2 }}>
                      <button
                        style={styles.iconBtnMuted}
                        onClick={() => onEdit(it)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        style={styles.iconBtnMuted}
                        onClick={() => onDelete(it.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    ...styles.batchChip,
                    background: low
                      ? URGENCY_STYLE.critical.bg
                      : URGENCY_STYLE.ok.bg,
                    color: low
                      ? URGENCY_STYLE.critical.fg
                      : URGENCY_STYLE.ok.fg,
                    borderColor: low
                      ? URGENCY_STYLE.critical.bar
                      : URGENCY_STYLE.ok.bar,
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {it.qty} متوفر {low && "· ناقص"}
                  </span>
                  <span style={{ opacity: 0.8, fontSize: 12 }}>
                    حد التنبيه: {it.threshold}
                  </span>
                </div>
                {isOwner && (
                  <div style={styles.medCardActions}>
                    <button
                      style={styles.secondaryBtn}
                      onClick={() => onAdjust(it.id, -1)}
                    >
                      −١
                    </button>
                    <button
                      style={styles.secondaryBtn}
                      onClick={() => onAdjust(it.id, 1)}
                    >
                      +١
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

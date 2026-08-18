import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { styles } from "../styles/styles";
import { LABEL_META } from "../constants";
import { listProfiles, setUserRole } from "../lib/pharmacyApi";

function TeamSection({ currentUserId }) {
  const [profiles, setProfiles] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    listProfiles()
      .then(setProfiles)
      .catch((e) => setError(e.message));
  }, []);

  // UX convenience only — the real, race-safe boundary is enforced in the
  // set_user_role() database function itself (see
  // supabase/migrations/0012_protect_last_admin.sql). This just avoids an
  // avoidable round-trip/error for the common case of one admin viewing
  // their own team list.
  const adminCount = (profiles || []).filter((p) => p.role === "admin").length;

  const toggleRole = async (p) => {
    const nextRole = p.role === "admin" ? "staff" : "admin";
    setBusyId(p.id);
    setError("");
    try {
      const updated = await setUserRole(p.id, nextRole);
      setProfiles((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div style={styles.settingsSectionTitle}>أعضاء الفريق والصلاحيات</div>
      {error && (
        <div style={{ color: "#9A2E23", fontSize: 12.5, marginBottom: 8 }}>
          {error}
        </div>
      )}
      {!profiles ? (
        <div style={{ color: "#7C918F", fontSize: 12.5 }}>جارٍ التحميل…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {profiles.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                background: "#F7FAF9",
                border: "1px solid #E4EEEC",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12.5,
              }}
            >
              <span style={{ wordBreak: "break-all" }}>
                {p.email} {p.id === currentUserId && "(أنت)"}
              </span>
              <button
                style={{ ...styles.secondaryBtn, flex: "none" }}
                onClick={() => toggleRole(p)}
                disabled={
                  busyId === p.id ||
                  p.id === currentUserId ||
                  (p.role === "admin" && adminCount <= 1)
                }
                title={
                  p.id === currentUserId
                    ? "لا يمكنك تغيير صلاحيتك الخاصة"
                    : p.role === "admin" && adminCount <= 1
                      ? "لا يمكن إزالة صلاحية المسؤول عن آخر مسؤول في الصيدلية"
                      : "تبديل الصلاحية"
                }
              >
                {p.role === "admin" ? "مسؤول" : "موظف"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function SettingsPanel({ labels, onSaveLabels, currentUserId }) {
  const [labelValues, setLabelValues] = useState(labels);
  const [savedFlash, setSavedFlash] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <TeamSection currentUserId={currentUserId} />

      <section>
        <div style={styles.settingsSectionTitle}>تخصيص نصوص الواجهة</div>
        <div style={styles.labelEditGrid}>
          {LABEL_META.map(([key, desc]) => (
            <label key={key} style={styles.label}>
              {desc}
              <input
                style={styles.input}
                value={labelValues[key] ?? ""}
                onChange={(e) =>
                  setLabelValues((v) => ({ ...v, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <button
          style={{ ...styles.primaryBtn, marginTop: 12 }}
          onClick={() => {
            onSaveLabels(labelValues);
            setSavedFlash("تم حفظ نصوص الواجهة");
            setTimeout(() => setSavedFlash(""), 1500);
          }}
        >
          <Check size={16} /> حفظ نصوص الواجهة
        </button>
      </section>

      {savedFlash && (
        <div style={{ color: "#145C5C", fontSize: 12.5, fontWeight: 700 }}>
          {savedFlash}
        </div>
      )}
    </div>
  );
}

import { KeyRound, Mail, ShieldCheck, UserCircle, Users } from "lucide-react";
import { styles } from "../../styles/styles";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { DevelopersSection } from "./DevelopersSection";
import { EditableProfileField } from "./EditableProfileField";

const NOT_SET = "غير محدد";

// Read-only row, used only for email and role — neither has an edit
// affordance (email must stay read-only per product requirement; role is
// managed exclusively via set_user_role(), from the Settings team list).
function InfoRow({ icon, label, value }) {
  return (
    <div style={styles.profileInfoRow}>
      <span style={styles.profileInfoIcon}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={styles.profileInfoLabel}>{label}</div>
        <div style={styles.profileInfoValue}>{value}</div>
      </div>
    </div>
  );
}

// user: the Supabase auth user (from useAuth().user) — email only.
// profile: the app's own `profiles` row (from useAuth().profile) — the
// single source for role, full_name, and job_title (see
// supabase/migrations/0017_profile_full_name_job_title.sql).
// onUpdateProfile(fullName, jobTitle): persists both fields together (the
// underlying update_own_profile() RPC always writes both columns), so each
// field's save handler below sends its own new value alongside the OTHER
// field's current committed value — never a stale/guessed one, since both
// come from the same up-to-date `profile` prop.
export function ProfilePage({ user, profile, onChangePassword, onUpdateProfile }) {
  const roleLabel = profile?.role === "admin" ? "مسؤول" : profile?.role === "staff" ? "موظف" : NOT_SET;

  return (
    <div style={styles.profileSection}>
      <section>
        <div style={styles.settingsSectionTitle}>معلومات الحساب</div>
        <div style={styles.profileInfoGrid}>
          <EditableProfileField
            icon={<UserCircle size={16} />}
            label="الاسم الكامل"
            value={profile?.fullName ?? ""}
            required
            placeholder="أدخل اسمك الكامل"
            onSave={(newValue) => onUpdateProfile(newValue, profile?.jobTitle ?? "")}
          />
          <EditableProfileField
            icon={<Users size={16} />}
            label="المسمى الوظيفي"
            value={profile?.jobTitle ?? ""}
            placeholder="مثال: صيدلي، ممرض..."
            onSave={(newValue) => onUpdateProfile(profile?.fullName ?? "", newValue)}
          />
          <InfoRow icon={<Mail size={16} />} label="البريد الإلكتروني" value={user?.email || NOT_SET} />
          <InfoRow icon={<ShieldCheck size={16} />} label="الصلاحية" value={roleLabel} />
        </div>
      </section>

      <section>
        <div style={styles.settingsSectionTitle}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <KeyRound size={15} /> الأمان — تغيير كلمة المرور
          </span>
        </div>
        <ChangePasswordForm onChangePassword={onChangePassword} />
      </section>

      <section>
        <div style={styles.settingsSectionTitle}>فريق التطوير</div>
        <DevelopersSection />
      </section>
    </div>
  );
}

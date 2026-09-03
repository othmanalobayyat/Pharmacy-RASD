import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { styles } from "../../styles/styles";

// Single icon-slot text/password input, matching the auth screen's
// authLabel/authInputWrap/authInput pattern — the slot holds a real,
// clickable show/hide toggle here instead of a decorative icon.
function PasswordField({ label, value, onChange, show, onToggleShow, autoComplete, placeholder }) {
  return (
    <label style={styles.authLabel}>
      {label}
      <div style={styles.authInputWrap}>
        <input
          type={show ? "text" : "password"}
          required
          style={styles.authInput}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          style={styles.authInputToggleBtn}
          onClick={onToggleShow}
          aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          tabIndex={-1}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

const MIN_PASSWORD_LENGTH = 6;

// Delegates the actual change to Supabase Auth (via useAuth's
// changePassword -> lib/auth.js changePassword -> supabase.auth.updateUser())
// — this component only handles input state, client-side validation, and
// success/error feedback. No password is ever stored or logged here.
export function ChangePasswordForm({ onChangePassword }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`كلمة المرور الجديدة يجب أن تتكون من ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية.");
      return;
    }

    setBusy(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setSuccess("تم تغيير كلمة المرور بنجاح.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form style={styles.form} onSubmit={handleSubmit}>
      <PasswordField
        label="كلمة المرور الحالية"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        show={showCurrent}
        onToggleShow={() => setShowCurrent((v) => !v)}
        autoComplete="current-password"
        placeholder="أدخل كلمة المرور الحالية"
      />
      <PasswordField
        label="كلمة المرور الجديدة"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        show={showNew}
        onToggleShow={() => setShowNew((v) => !v)}
        autoComplete="new-password"
        placeholder={`${MIN_PASSWORD_LENGTH} أحرف على الأقل`}
      />
      <PasswordField
        label="تأكيد كلمة المرور الجديدة"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        show={showConfirm}
        onToggleShow={() => setShowConfirm((v) => !v)}
        autoComplete="new-password"
        placeholder="أعد إدخال كلمة المرور الجديدة"
      />
      {error && (
        <div role="alert" style={styles.authError}>
          {error}
        </div>
      )}
      {success && <div style={styles.authSuccessNote}>{success}</div>}
      <button type="submit" style={styles.primaryBtn} disabled={busy}>
        <Check size={16} /> {busy ? "جارٍ التغيير…" : "تغيير كلمة المرور"}
      </button>
    </form>
  );
}

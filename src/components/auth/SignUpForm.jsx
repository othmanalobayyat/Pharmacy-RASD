import { useState } from "react";
import { Check, Mail, Lock } from "lucide-react";
import { styles } from "../../styles/styles";

export function SignUpForm({ onSubmit, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  if (needsConfirmation) {
    return (
      <div style={styles.authSuccessNote}>
        تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيد الحساب قبل الدخول.
      </div>
    );
  }

  return (
    <form
      style={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const { needsEmailConfirmation } = await onSubmit(email.trim(), password);
          if (needsEmailConfirmation) setNeedsConfirmation(true);
        } catch {
          // useAuth stores the message in `error`.
        } finally {
          setBusy(false);
        }
      }}
    >
      <div style={styles.authHelperNote}>
        أول شخص يسجّل حساب بيصير مسؤول العيادة تلقائيًا؛ أي حساب بعده بيكون
        بصلاحية "موظف" وممكن المسؤول يرفع صلاحيته لاحقًا من الإعدادات.
      </div>
      <label style={styles.authLabel}>
        البريد الإلكتروني
        <div style={styles.authInputWrap}>
          <Mail size={16} style={styles.authInputIcon} />
          <input
            type="email"
            required
            style={styles.authInput}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="أدخل بريدك الإلكتروني"
          />
        </div>
      </label>
      <label style={styles.authLabel}>
        كلمة المرور
        <div style={styles.authInputWrap}>
          <Lock size={16} style={styles.authInputIcon} />
          <input
            type="password"
            required
            minLength={6}
            style={styles.authInput}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="أدخل كلمة المرور (٦ أحرف على الأقل)"
          />
        </div>
      </label>
      {error && <div style={styles.authError}>{error}</div>}
      <button type="submit" className="auth-primary-btn" style={styles.authPrimaryBtn} disabled={busy}>
        <Check size={17} /> {busy ? "جارٍ الإنشاء…" : "إنشاء حساب"}
      </button>
    </form>
  );
}

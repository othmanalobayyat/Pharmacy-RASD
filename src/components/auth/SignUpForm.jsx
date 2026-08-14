import { useState } from "react";
import { Check } from "lucide-react";
import { styles } from "../../styles/styles";

export function SignUpForm({ onSubmit, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  if (needsConfirmation) {
    return (
      <div style={{ fontSize: 13, color: "#3A4E4C", lineHeight: 1.7 }}>
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
      <div style={{ fontSize: 12.5, color: "#7C918F" }}>
        أول شخص يسجّل حساب بيصير مسؤول العيادة تلقائيًا؛ أي حساب بعده بيكون
        بصلاحية "موظف" وممكن المسؤول يرفع صلاحيته لاحقًا من الإعدادات.
      </div>
      <label style={styles.label}>
        البريد الإلكتروني
        <input
          type="email"
          required
          style={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label style={styles.label}>
        كلمة المرور
        <input
          type="password"
          required
          minLength={6}
          style={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <div style={{ color: "#9A2E23", fontSize: 12.5 }}>{error}</div>}
      <button type="submit" style={styles.primaryBtn} disabled={busy}>
        <Check size={16} /> {busy ? "جارٍ الإنشاء…" : "إنشاء حساب"}
      </button>
    </form>
  );
}

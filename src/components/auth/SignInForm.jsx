import { useState } from "react";
import { Check, Mail, Lock } from "lucide-react";
import { styles } from "../../styles/styles";

export function SignInForm({ onSubmit, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      style={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(email.trim(), password);
        } catch {
          // useAuth already stores the message in `error` (authError); the
          // rethrow just stops this handler here.
        } finally {
          setBusy(false);
        }
      }}
    >
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
            autoFocus
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
            style={styles.authInput}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="أدخل كلمة المرور"
          />
        </div>
      </label>
      {error && <div style={styles.authError}>{error}</div>}
      <button type="submit" className="auth-primary-btn" style={styles.authPrimaryBtn} disabled={busy}>
        <Check size={17} /> {busy ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}

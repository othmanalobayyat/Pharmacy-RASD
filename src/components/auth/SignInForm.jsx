import { useState } from "react";
import { Check } from "lucide-react";
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
      <label style={styles.label}>
        البريد الإلكتروني
        <input
          type="email"
          required
          style={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
      </label>
      <label style={styles.label}>
        كلمة المرور
        <input
          type="password"
          required
          style={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <div style={{ color: "#9A2E23", fontSize: 12.5 }}>{error}</div>}
      <button type="submit" style={styles.primaryBtn} disabled={busy}>
        <Check size={16} /> {busy ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}

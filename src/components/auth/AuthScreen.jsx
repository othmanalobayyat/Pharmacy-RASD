import { useState } from "react";
import { Radar, Pill } from "lucide-react";
import { styles } from "../../styles/styles";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

// Full-screen gate shown whenever there is no authenticated session. Replaces
// the old PIN-gated "owner mode" toggle — every user now has a real Supabase
// account, and read/write permissions are enforced by RLS, not by whether
// this screen was shown.
//
// Visual/UX polish pass only — signIn/signUp/authError still come straight
// from useAuth() untouched; this component only decides how the same
// mode/tab state and the same two form components are presented.
export function AuthScreen({ appTitle, appSubtitle, signIn, signUp, authError }) {
  const [mode, setMode] = useState("signin");

  return (
    <div style={styles.authPage}>
      <div className="auth-decor-circle" style={styles.authDecorCircleA} aria-hidden="true" />
      <div className="auth-decor-circle" style={styles.authDecorCircleB} aria-hidden="true" />

      <header style={styles.authHeader}>
        <div style={styles.authHeaderInner}>
          <div style={styles.authHeaderBadge}>
            <Radar size={17} color="#F6F5F1" />
          </div>
          <div>
            <h1 style={styles.authHeaderTitle}>{appTitle}</h1>
            <div style={styles.authHeaderSubtitle}>{appSubtitle}</div>
          </div>
        </div>
      </header>

      <main style={styles.authMain}>
        <div style={styles.authCard}>
          <div style={styles.authCardHead}>
            <div style={styles.authCardIconBadge}>
              <Pill size={24} color="#fff" />
            </div>
            <div>
              <div style={styles.authCardWelcome}>مرحبًا بك في</div>
              <div style={styles.authCardBrand}>{appTitle}</div>
            </div>
            <div style={styles.authCardDescription}>
              {mode === "signin"
                ? "سجّل الدخول للوصول إلى نظام إدارة المخزون ومتابعة الأدوية"
                : "أنشئ حسابًا للانضمام إلى نظام إدارة الصيدلية"}
            </div>
          </div>

          <div style={styles.authTabTrack} role="tablist">
            <button
              className="auth-tab"
              style={styles.authTab(mode === "signin")}
              onClick={() => setMode("signin")}
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
            >
              دخول
            </button>
            <button
              className="auth-tab"
              style={styles.authTab(mode === "signup")}
              onClick={() => setMode("signup")}
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
            >
              حساب جديد
            </button>
          </div>

          {mode === "signin" ? (
            <SignInForm onSubmit={signIn} error={authError} />
          ) : (
            <SignUpForm onSubmit={signUp} error={authError} />
          )}
        </div>
      </main>

      <footer style={styles.authFooter}>{appTitle} — نظام إدارة مخزون العيادة المتنقلة</footer>
    </div>
  );
}

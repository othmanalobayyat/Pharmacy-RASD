import { useState } from "react";
import { Radar } from "lucide-react";
import { styles } from "../../styles/styles";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

// Full-screen gate shown whenever there is no authenticated session. Replaces
// the old PIN-gated "owner mode" toggle — every user now has a real Supabase
// account, and read/write permissions are enforced by RLS, not by whether
// this screen was shown.
export function AuthScreen({ appTitle, appSubtitle, signIn, signUp, authError }) {
  const [mode, setMode] = useState("signin");

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerTitleRow}>
          <div style={styles.headerLogo}>
            <Radar size={20} color="#F6F5F1" />
          </div>
          <div>
            <h1 style={styles.h1}>{appTitle}</h1>
            <div style={styles.subtitle}>{appSubtitle}</div>
          </div>
        </div>
      </header>

      <div
        style={{
          maxWidth: 380,
          margin: "40px auto",
          padding: "0 16px",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #DCE8E6",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            <button
              style={styles.tabBtn(mode === "signin")}
              onClick={() => setMode("signin")}
              type="button"
            >
              دخول
            </button>
            <button
              style={styles.tabBtn(mode === "signup")}
              onClick={() => setMode("signup")}
              type="button"
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
      </div>
    </div>
  );
}

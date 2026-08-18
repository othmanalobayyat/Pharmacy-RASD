import { Component } from "react";
import { styles } from "../styles/styles";

// Final safety net for unexpected React render/lifecycle errors — NOT a
// replacement for the app's existing error handling. Error boundaries only
// catch exceptions thrown while rendering, in lifecycle methods, or in
// constructors; they cannot and do not catch errors from event handlers,
// async code, or rejected promises (React never routes those here), which is
// exactly where every validation/API/permission/network error in this app
// already gets caught and mapped to a safe message (see
// src/lib/errorMessages.js). So this component can never intercept or
// swallow one of those — it only ever fires for a genuine rendering bug.
export class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Full technical detail stays in the console for developers, same
    // pattern as logAndThrow() — never shown to the user.
    console.error("[ErrorBoundary]", error, info);
  }

  handleRetry = () => {
    // Resetting local state (not a timer/effect) re-attempts rendering the
    // children exactly once per click — no automatic retry loop is possible.
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" style={styles.loadingScreen}>
          <div style={{ color: "#9A2E23", fontSize: 15, fontWeight: 800 }}>
            حدث خطأ غير متوقع
          </div>
          <div style={{ color: "#5B6E6D", fontSize: 13, maxWidth: 420, textAlign: "center" }}>
            حاول إعادة تشغيل النظام، وإذا استمرت المشكلة تواصل مع الدعم الفني.
          </div>
          <button style={styles.primaryBtn} onClick={this.handleRetry}>
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

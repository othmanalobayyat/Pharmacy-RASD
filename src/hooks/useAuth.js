import { useState, useEffect, useCallback, useRef } from "react";
import { isSupabaseConfigured } from "../lib/supabase";
import * as auth from "../lib/auth";

// Session + role/clinic membership. This is the *real* authorization
// boundary's client-side reflection — the actual enforcement lives in
// Postgres RLS (supabase/migrations/0002_rls_policies.sql); this hook only
// decides what the UI shows, never what the database allows.
export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const profileRetryRef = useRef(null);

  const loadProfile = useCallback(async (userId, attempt = 1) => {
    if (!userId) {
      setProfile(null);
      return;
    }

    let data;
    try {
      data = await auth.fetchProfile(userId);
    } catch (e) {
      console.error("[useAuth] failed to load profile", e);
      setProfile(null);
      return;
    }

    if (!data && attempt < 5) {
      // handle_new_user() runs in an AFTER INSERT trigger on auth.users —
      // right after signUp() the row can lag by a beat; retry briefly
      // instead of showing "no profile" for a real, freshly-created account.
      profileRetryRef.current = setTimeout(
        () => loadProfile(userId, attempt + 1),
        600,
      );
      return;
    }

    setProfile(data);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const current = await auth.getSession();
        if (cancelled) return;
        setSession(current);
        if (current?.user) await loadProfile(current.user.id);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const unsubscribe = auth.onAuthStateChange((next) => {
      setSession(next);
      if (next?.user) {
        loadProfile(next.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (profileRetryRef.current) clearTimeout(profileRetryRef.current);
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email, password) => {
    setAuthError("");
    try {
      await auth.signIn(email, password);
    } catch (e) {
      setAuthError(e.message);
      throw e;
    }
  }, []);

  const signUp = useCallback(async (email, password) => {
    setAuthError("");
    try {
      const data = await auth.signUp(email, password);
      return { needsEmailConfirmation: !data.session };
    } catch (e) {
      setAuthError(e.message);
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError("");
    await auth.signOut();
  }, []);

  return {
    configured: isSupabaseConfigured,
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === "admin",
    loading,
    authError,
    signIn,
    signUp,
    signOut,
  };
}

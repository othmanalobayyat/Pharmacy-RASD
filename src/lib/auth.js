// Thin wrapper around supabase-js auth calls, kept separate from
// pharmacyApi.js since auth and inventory data have different lifecycles
// (auth state is needed before any clinic data can load at all).

import { supabase } from "./supabase";
import { logAndThrow } from "./errorMessages";

export async function signUp(email, password) {
  let data, error;
  try {
    ({ data, error } = await supabase.auth.signUp({ email, password }));
  } catch (networkError) {
    logAndThrow("auth.signUp", networkError);
  }
  if (error) logAndThrow("auth.signUp", error);
  return data;
}

export async function signIn(email, password) {
  let data, error;
  try {
    ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
  } catch (networkError) {
    logAndThrow("auth.signIn", networkError);
  }
  if (error) logAndThrow("auth.signIn", error);
  return data;
}

export async function signOut() {
  let error;
  try {
    ({ error } = await supabase.auth.signOut());
  } catch (networkError) {
    logAndThrow("auth.signOut", networkError);
  }
  if (error) logAndThrow("auth.signOut", error);
}

export async function getSession() {
  let data, error;
  try {
    ({ data, error } = await supabase.auth.getSession());
  } catch (networkError) {
    logAndThrow("auth.getSession", networkError);
  }
  if (error) logAndThrow("auth.getSession", error);
  return data.session;
}

// Changes the signed-in user's password via Supabase Auth's own
// updateUser() — no custom password storage/verification of any kind.
// updateUser() alone only needs an active session (it does NOT ask for the
// current password), so the current-password field the UI requires is
// verified here first via signInWithPassword() (the same call signIn()
// above already uses) — reusing the live session's own email, never a
// second credential store. A wrong current password fails at that first
// step with a message distinct from updateUser()'s own errors (e.g. "new
// password same as old"), which still flow through logAndThrow() below.
export async function changePassword(email, currentPassword, newPassword) {
  let error;
  try {
    ({ error } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    }));
  } catch (networkError) {
    logAndThrow("auth.changePassword.verify", networkError);
  }
  if (error) {
    console.error("[auth.changePassword.verify]", error);
    throw new Error("كلمة المرور الحالية غير صحيحة.");
  }

  try {
    ({ error } = await supabase.auth.updateUser({ password: newPassword }));
  } catch (networkError) {
    logAndThrow("auth.changePassword.update", networkError);
  }
  if (error) logAndThrow("auth.changePassword.update", error);
}

export function onAuthStateChange(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

function mapProfile(data) {
  return {
    id: data.id,
    clinicId: data.clinic_id,
    email: data.email,
    role: data.role,
    fullName: data.full_name,
    jobTitle: data.job_title,
  };
}

// Returns the raw profiles row (or null) for a given auth user id, mapped to
// camelCase. Kept here rather than in pharmacyApi.js since "who am I / what
// role do I have" is an auth concern, not a pharmacy-inventory one.
export async function fetchProfile(userId) {
  let data, error;
  try {
    ({ data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle());
  } catch (networkError) {
    logAndThrow("auth.fetchProfile", networkError);
  }
  if (error) logAndThrow("auth.fetchProfile", error);

  return data ? mapProfile(data) : null;
}

// Updates the caller's OWN full_name/job_title via the update_own_profile()
// RPC (see supabase/migrations/0017_profile_full_name_job_title.sql) — the
// only write path for these fields; profiles has no direct UPDATE policy
// for any field (see 0002_rls_policies.sql), and the RPC itself is scoped
// server-side to auth.uid(), never a client-supplied target id, so this can
// only ever change the caller's own profile.
export async function updateOwnProfile(fullName, jobTitle) {
  let data, error;
  try {
    ({ data, error } = await supabase.rpc("update_own_profile", {
      p_full_name: fullName,
      p_job_title: jobTitle,
    }));
  } catch (networkError) {
    logAndThrow("auth.updateOwnProfile", networkError);
  }
  if (error) logAndThrow("auth.updateOwnProfile", error);

  return mapProfile(data);
}

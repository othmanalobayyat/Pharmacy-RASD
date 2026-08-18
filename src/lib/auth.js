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

export function onAuthStateChange(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
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

  return data
    ? { id: data.id, clinicId: data.clinic_id, email: data.email, role: data.role }
    : null;
}

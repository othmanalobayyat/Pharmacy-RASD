// Thin wrapper around supabase-js auth calls, kept separate from
// pharmacyApi.js since auth and inventory data have different lifecycles
// (auth state is needed before any clinic data can load at all).

import { supabase } from "./supabase";

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
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
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data
    ? { id: data.id, clinicId: data.clinic_id, email: data.email, role: data.role }
    : null;
}

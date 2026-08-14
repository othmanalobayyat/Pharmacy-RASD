// Centralized Supabase data-access layer. Nothing outside this file (and
// src/lib/auth.js for auth) should import `supabase` directly — components
// and hooks only ever call the functions below, so the DB schema/row shape
// can change without touching UI code, same principle as the old
// lib/storage.js abstraction it replaces.
//
// Every function maps DB rows (snake_case) to the exact camelCase shapes the
// existing components already expect (med.categoryId, batch.addedDate,
// log.medId/medName/date, etc.) so the component layer needed minimal
// changes for this migration.

import { supabase } from "./supabase";

function unwrap({ data, error }) {
  if (error) {
    // Full detail for developers in the console; callers show a generic,
    // user-safe message so we never surface raw Postgres/RLS internals.
    console.error("[pharmacyApi]", error);
    throw new Error(error.message || "حصل خطأ غير متوقع أثناء التواصل مع الخادم");
  }
  return data;
}

// ---------- mappers ----------
const mapCategory = (r) => ({ id: r.id, name: r.name });
const mapBatch = (r) => ({
  id: r.id,
  medicationId: r.medication_id,
  expiry: r.expiry,
  qty: r.qty,
  addedDate: r.added_date,
});
const mapMedication = (r, batches) => ({
  id: r.id,
  name: r.name,
  categoryId: r.category_id,
  batches: batches.filter((b) => b.medicationId === r.id),
});
const mapFirstAid = (r) => ({
  id: r.id,
  name: r.name,
  qty: r.qty,
  threshold: r.threshold,
});
const mapLog = (r) => ({
  id: r.id,
  medId: r.medication_id,
  medName: r.med_name,
  batchId: r.batch_id,
  expiry: r.expiry,
  qty: r.qty,
  date: r.withdrawn_on,
  performedByEmail: r.performed_by_email,
});
const mapProfile = (r) => ({
  id: r.id,
  email: r.email,
  role: r.role,
  createdAt: r.created_at,
});

// ---------- full dataset load ----------
export async function fetchClinicData() {
  const [categoriesRes, medicationsRes, batchesRes, firstAidRes, logRes, labelsRes] =
    await Promise.all([
      supabase.from("categories").select("*").order("created_at", { ascending: true }),
      supabase.from("medications").select("*").order("created_at", { ascending: true }),
      supabase.from("batches").select("*"),
      supabase.from("first_aid_items").select("*").order("created_at", { ascending: true }),
      supabase.from("withdrawal_logs").select("*").order("created_at", { ascending: false }),
      supabase.from("ui_labels").select("*"),
    ]);

  const batches = unwrap(batchesRes).map(mapBatch);
  const categories = unwrap(categoriesRes).map(mapCategory);
  const medications = unwrap(medicationsRes).map((r) => mapMedication(r, batches));
  const firstAid = unwrap(firstAidRes).map(mapFirstAid);
  const log = unwrap(logRes).map(mapLog);
  const uiLabels = Object.fromEntries(
    unwrap(labelsRes).map((r) => [r.key, r.value]),
  );

  return { categories, medications, firstAid, log, uiLabels };
}

// ---------- categories ----------
export async function createCategory(clinicId, name) {
  const row = unwrap(
    await supabase
      .from("categories")
      .insert({ clinic_id: clinicId, name })
      .select()
      .single(),
  );
  return mapCategory(row);
}

export async function updateCategory(id, name) {
  const row = unwrap(
    await supabase.from("categories").update({ name }).eq("id", id).select().single(),
  );
  return mapCategory(row);
}

export async function deleteCategory(id) {
  unwrap(await supabase.from("categories").delete().eq("id", id));
}

// ---------- medications ----------
export async function createMedication(clinicId, { name, categoryId }) {
  const row = unwrap(
    await supabase
      .from("medications")
      .insert({ clinic_id: clinicId, name, category_id: categoryId })
      .select()
      .single(),
  );
  return mapMedication(row, []);
}

export async function updateMedication(id, { name, categoryId }) {
  unwrap(
    await supabase
      .from("medications")
      .update({ name, category_id: categoryId })
      .eq("id", id),
  );
}

export async function deleteMedication(id) {
  unwrap(await supabase.from("medications").delete().eq("id", id));
}

// ---------- batches ----------
export async function createBatch(clinicId, medicationId, { expiry, qty }) {
  const row = unwrap(
    await supabase
      .from("batches")
      .insert({
        clinic_id: clinicId,
        medication_id: medicationId,
        expiry,
        qty: Number(qty),
      })
      .select()
      .single(),
  );
  return mapBatch(row);
}

export async function deleteBatch(id) {
  unwrap(await supabase.from("batches").delete().eq("id", id));
}

// ---------- withdrawals (atomic FEFO RPC — see supabase/migrations/0003) ----------
export async function withdrawStock({ medicationId, qty, withdrawnOn, batchId = null }) {
  const row = unwrap(
    await supabase.rpc("withdraw_stock", {
      p_medication_id: medicationId,
      p_qty: Number(qty),
      p_withdrawn_on: withdrawnOn,
      p_batch_id: batchId,
    }),
  );
  return mapLog(row);
}

// ---------- first aid ----------
export async function createFirstAid(clinicId, { name, qty, threshold }) {
  const row = unwrap(
    await supabase
      .from("first_aid_items")
      .insert({
        clinic_id: clinicId,
        name,
        qty: Number(qty),
        threshold: Number(threshold),
      })
      .select()
      .single(),
  );
  return mapFirstAid(row);
}

export async function updateFirstAid(id, { name, threshold }) {
  unwrap(
    await supabase
      .from("first_aid_items")
      .update({ name, threshold: Number(threshold) })
      .eq("id", id),
  );
}

export async function deleteFirstAid(id) {
  unwrap(await supabase.from("first_aid_items").delete().eq("id", id));
}

export async function adjustFirstAid(id, delta) {
  const row = unwrap(
    await supabase.rpc("adjust_first_aid", { p_id: id, p_delta: delta }),
  );
  return mapFirstAid(row);
}

// ---------- ui labels ----------
export async function saveUiLabels(clinicId, labels) {
  const rows = Object.entries(labels).map(([key, value]) => ({
    clinic_id: clinicId,
    key,
    value: String(value ?? ""),
  }));
  if (rows.length === 0) return;
  unwrap(await supabase.from("ui_labels").upsert(rows, { onConflict: "clinic_id,key" }));
}

// ---------- legacy data migration ----------
// Used only by src/lib/migrateLegacyData.js. Historical import — does not
// touch any batch's qty (see supabase/migrations/0006).
export async function importLegacyWithdrawalLog({
  medicationId,
  medName,
  batchId,
  expiry,
  qty,
  withdrawnOn,
}) {
  const row = unwrap(
    await supabase.rpc("import_legacy_withdrawal_log", {
      p_medication_id: medicationId,
      p_med_name: medName,
      p_batch_id: batchId,
      p_expiry: expiry,
      p_qty: Number(qty),
      p_withdrawn_on: withdrawnOn,
    }),
  );
  return mapLog(row);
}

// Used to refuse migration if the clinic already has cloud data, so running
// the migration a second time (e.g. flag lost, or from a second browser
// that also has legacy data) can never create duplicates.
export async function hasAnyClinicData() {
  const [cats, meds, fa] = await Promise.all([
    supabase.from("categories").select("id", { count: "exact", head: true }),
    supabase.from("medications").select("id", { count: "exact", head: true }),
    supabase.from("first_aid_items").select("id", { count: "exact", head: true }),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (meds.error) throw new Error(meds.error.message);
  if (fa.error) throw new Error(fa.error.message);
  return (cats.count || 0) + (meds.count || 0) + (fa.count || 0) > 0;
}

// ---------- team / roles ----------
export async function listProfiles() {
  const rows = unwrap(
    await supabase.from("profiles").select("*").order("created_at", { ascending: true }),
  );
  return rows.map(mapProfile);
}

export async function setUserRole(userId, role) {
  const row = unwrap(
    await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role }),
  );
  return mapProfile(row);
}

// ---------- realtime ----------
// One channel per clinic covering every synced table. Returns an unsubscribe
// function; call it on unmount so a re-render/re-login never leaves a
// duplicate subscription running.
export function subscribeToClinicData(clinicId, handlers) {
  const channel = supabase
    .channel(`clinic-${clinicId}-data`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "categories", filter: `clinic_id=eq.${clinicId}` },
      () => handlers.onCategoriesChange?.(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "medications", filter: `clinic_id=eq.${clinicId}` },
      () => handlers.onMedicationsChange?.(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "batches", filter: `clinic_id=eq.${clinicId}` },
      () => handlers.onBatchesChange?.(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "first_aid_items", filter: `clinic_id=eq.${clinicId}` },
      () => handlers.onFirstAidChange?.(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "withdrawal_logs", filter: `clinic_id=eq.${clinicId}` },
      () => handlers.onLogChange?.(),
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

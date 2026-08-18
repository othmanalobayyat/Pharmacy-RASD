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
import { logAndThrow } from "./errorMessages";

// Takes a Supabase call *before* it's awaited (a PostgrestFilterBuilder or
// an .rpc() call — both are thenable) so this can catch BOTH failure shapes
// PostgREST/GoTrue calls can produce: a resolved `{ data, error }` (e.g. an
// RLS violation) and an outright rejected promise (a real network failure —
// `fetch` throws rather than resolving in that case). Either way, the
// caller only ever sees a safe, mapped Arabic message — see
// src/lib/errorMessages.js. `entity` is optional and only affects the
// duplicate-name (23505) message.
async function unwrap(supabaseCall, entity) {
  let result;
  try {
    result = await supabaseCall;
  } catch (networkError) {
    logAndThrow("pharmacyApi", networkError, entity);
  }
  const { data, error } = result;
  if (error) {
    logAndThrow("pharmacyApi", error, entity);
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
  const [categories, medicationRows, batches, firstAid, log, labelRows] = await Promise.all([
    unwrap(
      supabase.from("categories").select("*").order("created_at", { ascending: true }),
      "category",
    ).then((rows) => rows.map(mapCategory)),
    unwrap(
      supabase.from("medications").select("*").order("created_at", { ascending: true }),
      "medication",
    ),
    unwrap(supabase.from("batches").select("*")).then((rows) => rows.map(mapBatch)),
    unwrap(
      supabase.from("first_aid_items").select("*").order("created_at", { ascending: true }),
      "firstAid",
    ).then((rows) => rows.map(mapFirstAid)),
    unwrap(
      supabase.from("withdrawal_logs").select("*").order("created_at", { ascending: false }),
    ).then((rows) => rows.map(mapLog)),
    unwrap(supabase.from("ui_labels").select("*")),
  ]);

  const medications = medicationRows.map((r) => mapMedication(r, batches));
  const uiLabels = Object.fromEntries(labelRows.map((r) => [r.key, r.value]));

  return { categories, medications, firstAid, log, uiLabels };
}

// ---------- categories ----------
export async function createCategory(clinicId, name) {
  const row = await unwrap(
    supabase.from("categories").insert({ clinic_id: clinicId, name }).select().single(),
    "category",
  );
  return mapCategory(row);
}

export async function updateCategory(id, name) {
  const row = await unwrap(
    supabase.from("categories").update({ name }).eq("id", id).select().single(),
    "category",
  );
  return mapCategory(row);
}

export async function deleteCategory(id) {
  await unwrap(supabase.from("categories").delete().eq("id", id));
}

// ---------- medications ----------
export async function createMedication(clinicId, { name, categoryId }) {
  const row = await unwrap(
    supabase
      .from("medications")
      .insert({ clinic_id: clinicId, name, category_id: categoryId })
      .select()
      .single(),
    "medication",
  );
  return mapMedication(row, []);
}

export async function updateMedication(id, { name, categoryId }) {
  await unwrap(
    supabase.from("medications").update({ name, category_id: categoryId }).eq("id", id),
    "medication",
  );
}

export async function deleteMedication(id) {
  await unwrap(supabase.from("medications").delete().eq("id", id));
}

// ---------- batches ----------
export async function createBatch(clinicId, medicationId, { expiry, qty }) {
  const row = await unwrap(
    supabase
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
  await unwrap(supabase.from("batches").delete().eq("id", id));
}

// ---------- withdrawals (atomic FEFO RPC — see supabase/migrations/0010) ----------
export async function withdrawStock({ medicationId, qty, withdrawnOn, batchId = null }) {
  const row = await unwrap(
    supabase.rpc("withdraw_stock", {
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
  const row = await unwrap(
    supabase
      .from("first_aid_items")
      .insert({
        clinic_id: clinicId,
        name,
        qty: Number(qty),
        threshold: Number(threshold),
      })
      .select()
      .single(),
    "firstAid",
  );
  return mapFirstAid(row);
}

export async function updateFirstAid(id, { name, threshold }) {
  await unwrap(
    supabase.from("first_aid_items").update({ name, threshold: Number(threshold) }).eq("id", id),
    "firstAid",
  );
}

export async function deleteFirstAid(id) {
  await unwrap(supabase.from("first_aid_items").delete().eq("id", id));
}

export async function adjustFirstAid(id, delta) {
  const row = await unwrap(supabase.rpc("adjust_first_aid", { p_id: id, p_delta: delta }));
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
  await unwrap(supabase.from("ui_labels").upsert(rows, { onConflict: "clinic_id,key" }));
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
  const row = await unwrap(
    supabase.rpc("import_legacy_withdrawal_log", {
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
  let cats, meds, fa;
  try {
    [cats, meds, fa] = await Promise.all([
      supabase.from("categories").select("id", { count: "exact", head: true }),
      supabase.from("medications").select("id", { count: "exact", head: true }),
      supabase.from("first_aid_items").select("id", { count: "exact", head: true }),
    ]);
  } catch (networkError) {
    logAndThrow("pharmacyApi", networkError);
  }
  if (cats.error) logAndThrow("pharmacyApi", cats.error);
  if (meds.error) logAndThrow("pharmacyApi", meds.error);
  if (fa.error) logAndThrow("pharmacyApi", fa.error);
  return (cats.count || 0) + (meds.count || 0) + (fa.count || 0) > 0;
}

// ---------- team / roles ----------
export async function listProfiles() {
  const rows = await unwrap(
    supabase.from("profiles").select("*").order("created_at", { ascending: true }),
  );
  return rows.map(mapProfile);
}

export async function setUserRole(userId, role) {
  const row = await unwrap(supabase.rpc("set_user_role", { p_user_id: userId, p_role: role }));
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

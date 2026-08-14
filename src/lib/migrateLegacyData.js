// One-time migration of the pre-Supabase localStorage dataset into the
// clinic's cloud data. Never runs automatically and never deletes the
// original localStorage entry — it only ever ADDS a "done" flag once the
// import has fully succeeded, so a failed/partial run can always be
// retried and the raw legacy data is never lost.
//
// Note on IDs: the legacy app generated string ids like "cat-1699-abc123"
// (src/lib/uid.js), which cannot be reused as the new schema's `uuid`
// primary keys (see supabase/migrations/0001 — UUID PKs are deliberate, per
// the migration's own design goals). This module therefore inserts fresh
// rows and rebuilds every relationship (medication -> category,
// batch -> medication, log -> medication/batch) via an in-memory id map, so
// relationships are preserved exactly even though the literal id strings
// are not.

import * as api from "./pharmacyApi";

export const LEGACY_STORAGE_KEY = "clinic-pharmacy-state-v1";
const MIGRATION_FLAG_KEY = "clinic-pharmacy-migrated-v1";

export function hasMigrationRun() {
  return window.localStorage.getItem(MIGRATION_FLAG_KEY) === "true";
}

function markMigrationDone() {
  window.localStorage.setItem(MIGRATION_FLAG_KEY, "true");
}

export function readLegacyData() {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      medications: Array.isArray(parsed.medications) ? parsed.medications : [],
      firstAid: Array.isArray(parsed.firstAid) ? parsed.firstAid : [],
      log: Array.isArray(parsed.log) ? parsed.log : [],
      uiLabels:
        parsed.uiLabels && typeof parsed.uiLabels === "object" ? parsed.uiLabels : {},
    };
  } catch (e) {
    console.error("[migrateLegacyData] legacy data is corrupt, skipping", e);
    return null;
  }
}

export function hasLegacyData() {
  const data = readLegacyData();
  if (!data) return false;
  return (
    data.categories.length > 0 ||
    data.medications.length > 0 ||
    data.firstAid.length > 0 ||
    data.log.length > 0
  );
}

// Returns { migrated: true, counts } on success,
// { migrated: false, reason } when skipped, and throws on a real failure
// (caller shows the error; nothing is marked "done" so it can be retried).
export async function migrateLegacyDataToSupabase(clinicId) {
  if (hasMigrationRun()) {
    return { migrated: false, reason: "already-migrated" };
  }

  const legacy = readLegacyData();
  if (!legacy || !hasLegacyData()) {
    return { migrated: false, reason: "no-legacy-data" };
  }

  const alreadyHasCloudData = await api.hasAnyClinicData();
  if (alreadyHasCloudData) {
    return { migrated: false, reason: "clinic-already-has-data" };
  }

  const categoryIdMap = new Map(); // legacy id -> new uuid
  const medicationIdMap = new Map();
  const batchIdMap = new Map();
  const counts = { categories: 0, medications: 0, batches: 0, firstAid: 0, log: 0 };

  for (const c of legacy.categories) {
    if (!c?.name?.trim()) continue;
    const created = await api.createCategory(clinicId, c.name.trim());
    categoryIdMap.set(c.id, created.id);
    counts.categories += 1;
  }

  for (const m of legacy.medications) {
    if (!m?.name?.trim()) continue;
    const created = await api.createMedication(clinicId, {
      name: m.name.trim(),
      categoryId: categoryIdMap.get(m.categoryId) || null,
    });
    medicationIdMap.set(m.id, created.id);
    counts.medications += 1;

    for (const b of m.batches || []) {
      if (!b?.expiry || typeof b.qty !== "number") continue;
      const createdBatch = await api.createBatch(clinicId, created.id, {
        expiry: b.expiry,
        qty: b.qty,
      });
      batchIdMap.set(b.id, createdBatch.id);
      counts.batches += 1;
    }
  }

  for (const f of legacy.firstAid) {
    if (!f?.name?.trim()) continue;
    await api.createFirstAid(clinicId, {
      name: f.name.trim(),
      qty: f.qty || 0,
      threshold: f.threshold || 0,
    });
    counts.firstAid += 1;
  }

  // Sorted oldest-first so the imported audit trail reads chronologically.
  const sortedLog = [...legacy.log].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const l of sortedLog) {
    if (!l?.medName || !l?.qty || !l?.date) continue;
    await api.importLegacyWithdrawalLog({
      medicationId: medicationIdMap.get(l.medId) || null,
      medName: l.medName,
      batchId: batchIdMap.get(l.batchId) || null,
      expiry: l.expiry || null,
      qty: l.qty,
      withdrawnOn: l.date,
    });
    counts.log += 1;
  }

  if (Object.keys(legacy.uiLabels).length > 0) {
    await api.saveUiLabels(clinicId, legacy.uiLabels);
  }

  markMigrationDone();
  return { migrated: true, counts };
}

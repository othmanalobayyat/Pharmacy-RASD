import { daysUntilMonthEnd, isExpired, todayISO } from "./dates";

export function urgency(days) {
  if (days < 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= 90) return "warning";
  return "ok";
}

// Used only for the urgency badge (a medication whose earliest batch is
// already expired should still show as "expired" on the card) — deliberately
// includes expired batches. Do NOT use this to decide what can be withdrawn;
// use withdrawableBatches() below for that.
export function medEarliestBatch(med) {
  const withStock = med.batches.filter((b) => b.qty > 0);
  if (withStock.length === 0) return null;
  return withStock.reduce((a, b) =>
    new Date(a.expiry) < new Date(b.expiry) ? a : b,
  );
}

// Batches that are actually eligible to be withdrawn from: qty > 0 AND not
// expired (month/year semantics — see lib/dates.js isExpired()), earliest
// expiry first (FEFO order). Mirrors the same condition enforced
// server-side in withdraw_stock() (see
// supabase/migrations/0010_month_year_expiry.sql) so the UI never offers a
// choice the database would reject. The RPC remains the real enforcement
// point — this is only for what the client displays/offers.
export function withdrawableBatches(med, referenceISO = todayISO()) {
  return med.batches
    .filter((b) => b.qty > 0 && !isExpired(b.expiry, referenceISO))
    .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
}

export function medTotalQty(med) {
  return med.batches.reduce((sum, b) => sum + b.qty, 0);
}

// ---------- available vs. expired quantity ----------
//
// medTotalQty() above counts every unit physically on the shelf, expired or
// not — fine for "how much stock exists," misleading as "how much can be
// dispensed." These two split that total by the same month/year expiry rule
// used everywhere else (see lib/dates.js isExpired()): every batch falls
// into exactly one bucket, so medAvailableQty(med) + medExpiredQty(med)
// always equals medTotalQty(med). Neither changes any stored quantity —
// purely a display-time split of data that's already loaded.
export function medAvailableQty(med, referenceISO = todayISO()) {
  return med.batches
    .filter((b) => !isExpired(b.expiry, referenceISO))
    .reduce((sum, b) => sum + b.qty, 0);
}

export function medExpiredQty(med, referenceISO = todayISO()) {
  return med.batches
    .filter((b) => isExpired(b.expiry, referenceISO))
    .reduce((sum, b) => sum + b.qty, 0);
}

// ---------- medication list ordering ----------
//
// The Medications tab's own display order — alphabetical by name (A -> Z),
// case-insensitive, independent of category/quantity/expiry/batch/created
// date. Deliberately NOT urgency-based (that used to be this list's order;
// see git history) — this is purely a display convenience for finding a
// medication by name, so it must never be affected by stock state.
//
// Comparison is a plain case-folded `<`/`>` on the name (not
// String.prototype.localeCompare()) — deterministic across every JS engine
// regardless of the runtime's ICU/locale data, and correct for the plain
// English A-Z ordering this list is specified to use.
function compareNamesCaseInsensitive(a, b) {
  const an = a.toLowerCase();
  const bn = b.toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

// Returns a NEW array — never mutates the input — sorted by med.name,
// case-insensitive A -> Z. Names that are equal case-insensitively (e.g.
// "Panadol" vs "PANADOL", or genuine duplicates) fall back to comparing
// `id`, so the resulting order is fully deterministic and stable across
// re-renders/re-fetches instead of depending on the input array's
// (arbitrary, fetch-order-dependent) original ordering.
export function sortMedicationsByName(medications) {
  return [...medications].sort((a, b) => {
    const byName = compareNamesCaseInsensitive(a.name, b.name);
    if (byName !== 0) return byName;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

export function medUrgency(med) {
  const earliest = medEarliestBatch(med);
  if (!earliest) return "empty";
  // Days until the end of the expiry month, not the stored day — a batch
  // expiring "08/2026" shouldn't start reading as more urgent than it is
  // just because its stored date happens to be early in August.
  return urgency(daysUntilMonthEnd(earliest.expiry));
}

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

export function medUrgency(med) {
  const earliest = medEarliestBatch(med);
  if (!earliest) return "empty";
  // Days until the end of the expiry month, not the stored day — a batch
  // expiring "08/2026" shouldn't start reading as more urgent than it is
  // just because its stored date happens to be early in August.
  return urgency(daysUntilMonthEnd(earliest.expiry));
}

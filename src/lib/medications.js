import { daysUntil } from "./dates";

export function urgency(days) {
  if (days < 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= 90) return "warning";
  return "ok";
}

export function medEarliestBatch(med) {
  const withStock = med.batches.filter((b) => b.qty > 0);
  if (withStock.length === 0) return null;
  return withStock.reduce((a, b) =>
    new Date(a.expiry) < new Date(b.expiry) ? a : b,
  );
}

export function medTotalQty(med) {
  return med.batches.reduce((sum, b) => sum + b.qty, 0);
}

export function medUrgency(med) {
  const earliest = medEarliestBatch(med);
  if (!earliest) return "empty";
  return urgency(daysUntil(earliest.expiry));
}

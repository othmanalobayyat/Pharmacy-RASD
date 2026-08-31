// Centralized medication-quantity wording: "عينة" (singular) / "عينات"
// (0 and 2+) — the pharmacy's preferred term, replacing "وحدة"/"وحدات".
// Only for user-facing text; never for field/variable/column names (qty,
// quantity, availableQty, etc.), which are untouched.
export function sampleWord(n) {
  return n === 1 ? "عينة" : "عينات";
}

export function formatSampleQty(n) {
  return `${n} ${sampleWord(n)}`;
}

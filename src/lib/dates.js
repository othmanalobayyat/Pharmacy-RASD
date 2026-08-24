export const todayISO = () => new Date().toISOString().slice(0, 10);

export const daysUntil = (isoDate) => {
  const today = new Date(todayISO());
  const target = new Date(isoDate);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

export function daysAgoLabel(iso) {
  const d = daysUntil(iso);
  if (d === 0) return "اليوم";
  if (d === -1) return "أمس";
  return `قبل ${Math.abs(d)} يوم`;
}

// ---------- month/year expiry ----------
//
// Business rule (confirmed with the business owner): medication expiry is
// month/year only, never a specific day. A batch expiring "08/2026" is
// valid through the entire month of August 2026 and only becomes expired
// starting 2026-09-01.
//
// `batches.expiry` stays a `date` column in Postgres (see
// supabase/migrations/0010_month_year_expiry.sql) — no type change, no
// data rewrite. Every comparison below only looks at the year+month
// component and ignores the stored day entirely, which is what makes this
// safe even for older rows whose day isn't 1 (pre-existing test data
// entered through the old day-precision picker) — they're automatically
// and correctly reinterpreted as "expires at the end of their stored
// month," with zero migration needed.

function monthKey(isoDate) {
  return isoDate.slice(0, 7); // "YYYY-MM" — zero-padded, so string comparison is chronological
}

// True once the current month is AFTER the expiry's month — never true
// during the expiry month itself, no matter which day of that month it is.
// Mirrors the database's own definition (`date_trunc('month', expiry) <
// date_trunc('month', current_date)` in withdraw_stock(),
// supabase/migrations/0010_month_year_expiry.sql).
export function isExpired(isoDate, referenceISO = todayISO()) {
  return monthKey(referenceISO) > monthKey(isoDate);
}

// True when a batch's expiry month is the SAME as the reference month (i.e.
// "expiring this month," not yet expired) — used by the Today/triage view.
// Reuses the same monthKey() used by isExpired() above so "this month" and
// "expired" can never disagree about what a batch's expiry month even is.
export function isExpiringThisMonth(isoDate, referenceISO = todayISO()) {
  return monthKey(isoDate) === monthKey(referenceISO);
}

// Days remaining until the END of the expiry month (or a negative count of
// days since that month ended, once expired) — used for the
// critical/warning/ok urgency thresholds so "how urgent is this" reflects
// real remaining shelf life instead of counting down to an arbitrary stored
// day within the month.
export function daysUntilMonthEnd(isoDate, referenceISO = todayISO()) {
  const [year, month] = isoDate.split("-").map(Number);
  // Date.UTC(year, month, 0) is JS's idiom for "the last day of `month`"
  // (month here is 1-based from the ISO string, and the Date constructor's
  // month argument is 0-based, so passing it unadjusted with day 0 lands on
  // the day before the 1st of that same month in 0-based terms — i.e. its
  // last day). Built with Date.UTC (not `new Date(y, m, d)`, which builds in
  // local time) so this is correct regardless of the runtime's timezone —
  // `new Date(y, m, 0)` followed by toISOString() shifts by a day in any
  // positive-UTC-offset timezone, which is exactly the class of bug this
  // whole change exists to remove.
  const lastDayISO = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const today = new Date(referenceISO);
  const target = new Date(lastDayISO);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// "2026-08-01" -> "08/2026" — the only format expiry should ever be shown
// to a user in; never a day-of-month.
export function formatMonthYear(isoDate) {
  const [year, month] = isoDate.split("-");
  return `${month}/${year}`;
}

// The value a native <input type="month"> produces ("2026-08") -> the
// day-01 ISO date this app stores ("2026-08-01").
export function monthInputToISO(monthValue) {
  return `${monthValue}-01`;
}

// The reverse, for pre-filling a month input from a stored ISO date.
export function isoToMonthInput(isoDate) {
  return isoDate.slice(0, 7);
}

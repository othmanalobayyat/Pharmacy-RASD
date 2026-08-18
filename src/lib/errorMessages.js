// Centralized technical-error -> safe Arabic user-facing message mapping.
//
//   technical error (Postgres/PostgREST/GoTrue/network)
//         |
//         v
//   toUserMessage() / logAndThrow()
//         |
//         v
//   clear Arabic message, no SQL/Postgres/RLS/Supabase/SQLSTATE/table names
//
// Full technical detail is always logged to the console (for developers) —
// see logAndThrow() below, which is what every data-access call site in
// this app actually uses. Nothing here hides errors; it only decides what
// text a pharmacy employee sees for a given failure.

const WARNING = "⚠️ ";

// One entry per entity that can have a duplicate-name conflict (Postgres
// SQLSTATE 23505 from the unique indexes in
// supabase/migrations/0008_prevent_duplicate_names.sql and
// 0009_categories_unique_name.sql). Wording matches the terms already used
// elsewhere in this app's UI ("فئة", "مادة إسعاف") rather than introducing
// new synonyms.
const DUPLICATE_MESSAGES = {
  category: "هذه الفئة موجودة بالفعل.",
  medication: "هذا الدواء موجود بالفعل.",
  firstAid: "مادة الإسعاف هذه موجودة بالفعل.",
};
const DUPLICATE_FALLBACK = "يوجد عنصر بهذا الاسم بالفعل.";

// Postgres SQLSTATE -> safe message. Covers both genuine RLS violations
// (Postgres itself raises 42501 for those, verified against the live
// project) and the same codes this app's own RPCs deliberately raise for
// equivalent situations (e.g. set_user_role()'s admin-only check also uses
// 42501 — same user-facing meaning, so the same message is correct).
const CODE_MESSAGES = {
  "42501": "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
  "28000": "انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى.",
  "22003": "الكمية المطلوبة غير متوفرة في المخزون.",
  "22023": "البيانات المدخلة غير صحيحة، يرجى التحقق والمحاولة مرة أخرى.",
  P0002: "لم يتم العثور على العنصر المطلوب. قد يكون تم حذفه من جهاز آخر.",
  // set_user_role() (supabase/migrations/0013_protect_last_admin_advisory_lock.sql,
  // superseding 0012) raises this when asked to demote a clinic's last
  // remaining admin. It already raises the message in Arabic, so the
  // hasArabic() passthrough above handles it in practice — this entry is
  // just explicit documentation/defense-in-depth in case that ever changes.
  P0003: "لا يمكن إزالة صلاحية المسؤول عن آخر مسؤول في الصيدلية.",
};

// Fallback for when there's no SQLSTATE at all (network failures, GoTrue
// auth errors, or any plain JS Error) — matched against the raw message.
const PATTERN_MESSAGES = [
  {
    re: /failed to fetch|networkerror|load failed|fetch failed|net::/i,
    message: "تعذر الاتصال بالنظام. تحقق من اتصال الإنترنت وحاول مرة أخرى.",
  },
  {
    re: /jwt|token is expired|invalid token|session.*(missing|not found)/i,
    message: "انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى.",
  },
  {
    re: /invalid login credentials/i,
    message: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  },
  {
    re: /email not confirmed/i,
    message: "يجب تأكيد البريد الإلكتروني أولاً — تحقق من صندوق الوارد.",
  },
  {
    re: /user already registered/i,
    message: "يوجد حساب مسجّل بهذا البريد الإلكتروني بالفعل.",
  },
  {
    re: /insufficient stock/i,
    message: "الكمية المطلوبة غير متوفرة في المخزون.",
  },
  {
    re: /password.*(least|characters|weak)/i,
    message: "كلمة المرور غير كافية — يجب أن تتكون من 6 أحرف على الأقل.",
  },
];

const GENERIC_FALLBACK =
  "حدث خطأ غير متوقع. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم الفني.";

function hasArabic(text) {
  return /[؀-ۿ]/.test(text);
}

// error: whatever was thrown/returned — a Postgrest/RPC error object
// ({ message, code, details, hint }), a GoTrue AuthError, a plain
// TypeError from a failed fetch, or already an Error instance.
// entity: optional hint ("category" | "medication" | "firstAid") used only
// to specialize the duplicate-name (23505) message.
export function toUserMessage(error, entity) {
  const message = error?.message || "";
  const code = error?.code;

  // Idempotency / safety net: if this message is already one of ours (or
  // any other already-Arabic, already-safe message — e.g. the expired-batch
  // messages withdraw_stock() raises directly in Arabic), don't re-map it
  // into something more generic. Just make sure it carries the warning
  // prefix, without doubling it.
  if (hasArabic(message)) {
    return message.startsWith(WARNING) ? message : WARNING + message;
  }

  if (code === "23505") {
    return WARNING + (DUPLICATE_MESSAGES[entity] || DUPLICATE_FALLBACK);
  }

  if (code && CODE_MESSAGES[code]) {
    return WARNING + CODE_MESSAGES[code];
  }

  const pattern = PATTERN_MESSAGES.find((p) => p.re.test(message));
  if (pattern) {
    return WARNING + pattern.message;
  }

  return WARNING + GENERIC_FALLBACK;
}

// Logs full technical detail (for developers, in the console only) and
// throws an Error whose .message is the safe, mapped text every UI error
// display (SaveIndicator, form error text, etc.) already just renders as-is
// — so no component needs to know this mapping exists.
export function logAndThrow(context, error, entity) {
  console.error(`[${context}]`, error);
  throw new Error(toUserMessage(error, entity));
}

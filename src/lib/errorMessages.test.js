import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toUserMessage, logAndThrow } from "./errorMessages";

const TECHNICAL_TERMS = /sql|postgres|rls|supabase|rpc|sqlstate|constraint|relation|column|table\b/i;

describe("toUserMessage() — RLS/permission errors", () => {
  it("maps a real RLS violation (as returned by the live project) to a safe Arabic permission message", () => {
    const msg = toUserMessage({
      code: "42501",
      message: 'new row violates row-level security policy for table "categories"',
    });
    expect(msg).toBe("⚠️ ليس لديك صلاحية لتنفيذ هذا الإجراء.");
    expect(msg).not.toMatch(TECHNICAL_TERMS);
  });

  it("maps a custom admin-only RPC rejection (same SQLSTATE) to the same safe message", () => {
    const msg = toUserMessage({ code: "42501", message: "only admins can change roles" });
    expect(msg).toBe("⚠️ ليس لديك صلاحية لتنفيذ هذا الإجراء.");
  });
});

describe("toUserMessage() — duplicate-name errors", () => {
  const DUPLICATE = { code: "23505", message: 'duplicate key value violates unique constraint "x"' };

  it("duplicate medication maps correctly", () => {
    expect(toUserMessage(DUPLICATE, "medication")).toBe("⚠️ هذا الدواء موجود بالفعل.");
  });
  it("duplicate category maps correctly", () => {
    expect(toUserMessage(DUPLICATE, "category")).toBe("⚠️ هذه الفئة موجودة بالفعل.");
  });
  it("duplicate first-aid item maps correctly", () => {
    expect(toUserMessage(DUPLICATE, "firstAid")).toBe("⚠️ مادة الإسعاف هذه موجودة بالفعل.");
  });
  it("a duplicate with no entity hint still gets a safe (generic duplicate) message, not raw Postgres text", () => {
    const msg = toUserMessage(DUPLICATE);
    expect(msg).not.toMatch(TECHNICAL_TERMS);
    expect(msg).toContain("بالفعل");
    expect(msg.startsWith("⚠️")).toBe(true);
  });
});

describe("toUserMessage() — expired-stock errors", () => {
  it("passes through the RPC's own already-safe Arabic expired-batch message, just adding the warning prefix", () => {
    const msg = toUserMessage({ code: "P0002", message: "لا يمكن صرف دفعة منتهية الصلاحية" });
    expect(msg).toBe("⚠️ لا يمكن صرف دفعة منتهية الصلاحية");
  });
  it("passes through the 'no valid stock' message the same way", () => {
    const msg = toUserMessage({
      code: "P0002",
      message: "لا يوجد مخزون صالح (غير منتهي الصلاحية) لهذا الدواء",
    });
    expect(msg).toContain("لا يوجد مخزون صالح");
    expect(msg.startsWith("⚠️")).toBe(true);
  });
  it("insufficient-stock (English RPC message) maps to a clear Arabic message", () => {
    const msg = toUserMessage({ code: "22003", message: "insufficient stock: available 2 but requested 5" });
    expect(msg).toBe("⚠️ الكمية المطلوبة غير متوفرة في المخزون.");
  });
});

describe("toUserMessage() — network / backend-unavailable errors", () => {
  it("a browser fetch failure maps to a useful connectivity message", () => {
    const msg = toUserMessage(new TypeError("Failed to fetch"));
    expect(msg).toBe("⚠️ تعذر الاتصال بالنظام. تحقق من اتصال الإنترنت وحاول مرة أخرى.");
  });
  it("a generic network error message also matches", () => {
    const msg = toUserMessage({ message: "NetworkError when attempting to fetch resource" });
    expect(msg).toContain("تعذر الاتصال بالنظام");
  });
});

describe("toUserMessage() — session/auth errors", () => {
  it("an expired/invalid JWT maps to a session-expired message", () => {
    expect(toUserMessage({ message: "JWT expired" })).toBe(
      "⚠️ انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى.",
    );
  });
  it("the app's own 'not authenticated' RPC rejection (28000) maps the same way", () => {
    expect(toUserMessage({ code: "28000", message: "not authenticated" })).toBe(
      "⚠️ انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى.",
    );
  });
  it("wrong sign-in credentials get a specific, helpful message", () => {
    expect(toUserMessage({ message: "Invalid login credentials" })).toBe(
      "⚠️ البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    );
  });
});

describe("toUserMessage() — last-admin protection (P0003)", () => {
  it("maps the database's last-admin rejection to the exact safe Arabic message, not the generic fallback", () => {
    const msg = toUserMessage({
      code: "P0003",
      message: "لا يمكن إزالة صلاحية المسؤول عن آخر مسؤول في الصيدلية",
    });
    expect(msg).toBe("⚠️ لا يمكن إزالة صلاحية المسؤول عن آخر مسؤول في الصيدلية");
    expect(msg).not.toBe(
      "⚠️ حدث خطأ غير متوقع. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم الفني.",
    );
  });

  it("still maps correctly by CODE_MESSAGES[P0003] even if the raised text were ever non-Arabic (defense-in-depth)", () => {
    const msg = toUserMessage({ code: "P0003", message: "last admin cannot be demoted" });
    expect(msg).toBe("⚠️ لا يمكن إزالة صلاحية المسؤول عن آخر مسؤول في الصيدلية.");
  });
});

describe("toUserMessage() — unknown/unrecognized errors", () => {
  it("falls back to one safe generic message for anything unrecognized", () => {
    const msg = toUserMessage({ message: "some completely novel failure xyz123" });
    expect(msg).toBe(
      "⚠️ حدث خطأ غير متوقع. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم الفني.",
    );
  });
  it("handles a missing/empty error gracefully (no crash, still a safe string)", () => {
    expect(() => toUserMessage(undefined)).not.toThrow();
    expect(typeof toUserMessage(undefined)).toBe("string");
    expect(toUserMessage(undefined)).not.toBe("");
  });
});

describe("logAndThrow() — developer detail stays in the console, only the safe message reaches the caller", () => {
  let consoleSpy;
  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("logs the full technical error and throws only the mapped message", () => {
    const technicalError = {
      code: "42501",
      message: 'new row violates row-level security policy for table "medications"',
      details: "Failing row contains (...)",
      hint: null,
    };

    let thrown;
    try {
      logAndThrow("pharmacyApi", technicalError, "medication");
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toBe("⚠️ ليس لديك صلاحية لتنفيذ هذا الإجراء.");
    expect(thrown.message).not.toMatch(TECHNICAL_TERMS);

    // developer detail: logged, with the full original error object intact
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith("[pharmacyApi]", technicalError);
  });
});

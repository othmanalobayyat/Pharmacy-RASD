// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(cleanup);

function Bomb({ shouldThrow }) {
  if (shouldThrow) throw new Error("boom: a genuine rendering bug");
  return <div>محتوى طبيعي</div>;
}

// The "fix" control lives OUTSIDE the boundary: once the boundary is
// showing its fallback, everything it wraps (including a control rendered
// as one of its own children) is unmounted, so recovery has to be driven
// from outside — exactly like a real user closing/reopening a modal or
// navigating away and back.
function Harness() {
  const [broken, setBroken] = useState(true);
  return (
    <div>
      <button onClick={() => setBroken(false)}>إصلاح</button>
      <ErrorBoundary>
        <Bomb shouldThrow={broken} />
      </ErrorBoundary>
    </div>
  );
}

describe("ErrorBoundary — final safety net for rendering errors", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("محتوى طبيعي")).toBeTruthy();
  });

  it("catches a real rendering error and shows the Arabic fallback, not a blank page", () => {
    // React itself logs the thrown error to console.error during the
    // catch cycle; silence it for this test only so expected-failure
    // output stays clean.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("حدث خطأ غير متوقع")).toBeTruthy();
    expect(
      screen.getByText("حاول إعادة تشغيل النظام، وإذا استمرت المشكلة تواصل مع الدعم الفني."),
    ).toBeTruthy();
    expect(screen.getByText("إعادة المحاولة")).toBeTruthy();

    // developer detail was logged; the raw technical message is never
    // shown in the fallback UI itself
    expect(consoleSpy).toHaveBeenCalled();
    expect(screen.queryByText(/boom/)).toBeNull();

    consoleSpy.mockRestore();
  });

  it("retry actually recovers once the underlying cause is fixed", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<Harness />);
    expect(screen.getByText("حدث خطأ غير متوقع")).toBeTruthy();

    // Fix the underlying cause first (outside the boundary), then retry —
    // this is the real recovery path this component exists for.
    fireEvent.click(screen.getByText("إصلاح"));
    fireEvent.click(screen.getByText("إعادة المحاولة"));

    expect(screen.getByText("محتوى طبيعي")).toBeTruthy();
    expect(screen.queryByText("حدث خطأ غير متوقع")).toBeNull();

    consoleSpy.mockRestore();
  });
});

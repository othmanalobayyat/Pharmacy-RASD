// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ChangePasswordForm } from "./ChangePasswordForm";

afterEach(cleanup);

function fillField(placeholder, value) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), {
    target: { value },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /تغيير كلمة المرور/ }));
}

describe("ChangePasswordForm — validation", () => {
  it("rejects a new password shorter than 6 characters without calling onChangePassword", () => {
    const onChangePassword = vi.fn();
    render(<ChangePasswordForm onChangePassword={onChangePassword} />);

    fillField("أدخل كلمة المرور الحالية", "oldpass1");
    fillField("6 أحرف على الأقل", "abc");
    fillField("أعد إدخال كلمة المرور الجديدة", "abc");
    submit();

    expect(onChangePassword).not.toHaveBeenCalled();
    expect(screen.getByText(/يجب أن تتكون من 6 أحرف على الأقل/)).toBeTruthy();
  });

  it("rejects a mismatched confirmation without calling onChangePassword", () => {
    const onChangePassword = vi.fn();
    render(<ChangePasswordForm onChangePassword={onChangePassword} />);

    fillField("أدخل كلمة المرور الحالية", "oldpass1");
    fillField("6 أحرف على الأقل", "newpass1");
    fillField("أعد إدخال كلمة المرور الجديدة", "newpass2");
    submit();

    expect(onChangePassword).not.toHaveBeenCalled();
    expect(screen.getByText("كلمة المرور الجديدة وتأكيدها غير متطابقين.")).toBeTruthy();
  });

  it("rejects a new password identical to the current password", () => {
    const onChangePassword = vi.fn();
    render(<ChangePasswordForm onChangePassword={onChangePassword} />);

    fillField("أدخل كلمة المرور الحالية", "samepass1");
    fillField("6 أحرف على الأقل", "samepass1");
    fillField("أعد إدخال كلمة المرور الجديدة", "samepass1");
    submit();

    expect(onChangePassword).not.toHaveBeenCalled();
    expect(
      screen.getByText("يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية."),
    ).toBeTruthy();
  });
});

describe("ChangePasswordForm — successful change", () => {
  it("calls onChangePassword with the entered values and shows success feedback, then clears the fields", async () => {
    const onChangePassword = vi.fn().mockResolvedValue(undefined);
    render(<ChangePasswordForm onChangePassword={onChangePassword} />);

    fillField("أدخل كلمة المرور الحالية", "oldpass1");
    fillField("6 أحرف على الأقل", "newpass1");
    fillField("أعد إدخال كلمة المرور الجديدة", "newpass1");
    submit();

    expect(onChangePassword).toHaveBeenCalledWith("oldpass1", "newpass1");
    expect(await screen.findByText("تم تغيير كلمة المرور بنجاح.")).toBeTruthy();

    // fields reset after success — no leftover password sitting in the form
    expect(screen.getByPlaceholderText("أدخل كلمة المرور الحالية").value).toBe("");
    expect(screen.getByPlaceholderText("6 أحرف على الأقل").value).toBe("");
    expect(screen.getByPlaceholderText("أعد إدخال كلمة المرور الجديدة").value).toBe("");
  });
});

describe("ChangePasswordForm — error handling", () => {
  it("shows the rejection's message (e.g. wrong current password) and does not show success", async () => {
    const onChangePassword = vi
      .fn()
      .mockRejectedValue(new Error("كلمة المرور الحالية غير صحيحة."));
    render(<ChangePasswordForm onChangePassword={onChangePassword} />);

    fillField("أدخل كلمة المرور الحالية", "wrongpass");
    fillField("6 أحرف على الأقل", "newpass1");
    fillField("أعد إدخال كلمة المرور الجديدة", "newpass1");
    submit();

    expect(await screen.findByText("كلمة المرور الحالية غير صحيحة.")).toBeTruthy();
    expect(screen.queryByText("تم تغيير كلمة المرور بنجاح.")).toBeNull();
  });
});

describe("ChangePasswordForm — show/hide password controls", () => {
  it("each password field starts masked and toggles to plain text on click", () => {
    render(<ChangePasswordForm onChangePassword={vi.fn()} />);

    const currentInput = screen.getByPlaceholderText("أدخل كلمة المرور الحالية");
    expect(currentInput.type).toBe("password");

    const toggleBtn = currentInput.parentElement.querySelector("button");
    fireEvent.click(toggleBtn);
    expect(currentInput.type).toBe("text");

    fireEvent.click(toggleBtn);
    expect(currentInput.type).toBe("password");
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ProfilePage } from "./ProfilePage";

afterEach(cleanup);

const baseUser = { id: "u1", email: "staff@clinic.test", user_metadata: {} };

function renderProfile(overrides = {}) {
  const props = {
    user: baseUser,
    profile: { id: "u1", role: "staff", clinicId: "c1", fullName: "محمد أحمد", jobTitle: "صيدلي" },
    onChangePassword: vi.fn(),
    onUpdateProfile: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  return { ...render(<ProfilePage {...props} />), props };
}

function pencilFor(label) {
  return screen.getByRole("button", { name: `تعديل ${label}` });
}

describe("ProfilePage — account information (display)", () => {
  it("displays the authenticated user's email and role from existing auth/profile data", () => {
    renderProfile({ profile: { id: "u1", role: "staff", clinicId: "c1", fullName: "محمد أحمد", jobTitle: "" } });
    expect(screen.getByText("staff@clinic.test")).toBeTruthy();
    expect(screen.getByText("موظف")).toBeTruthy();
  });

  it("shows 'مسؤول' for an admin profile", () => {
    renderProfile({ profile: { id: "u1", role: "admin", clinicId: "c1", fullName: "محمد أحمد", jobTitle: "" } });
    expect(screen.getByText("مسؤول")).toBeTruthy();
  });

  it("displays the current full name and job title from the profile row", () => {
    renderProfile();
    expect(screen.getByText("محمد أحمد")).toBeTruthy();
    expect(screen.getByText("صيدلي")).toBeTruthy();
  });

  it("falls back to a 'not set' placeholder when full name/job title were never saved", () => {
    renderProfile({ profile: { id: "u1", role: "staff", clinicId: "c1", fullName: "", jobTitle: "" } });
    expect(screen.getAllByText("غير محدد").length).toBe(2);
  });
});

describe("ProfilePage — full name: edit affordance and independent edit state", () => {
  it("is read-only by default, with a pencil button to enter edit mode", () => {
    renderProfile();
    expect(pencilFor("الاسم الكامل")).toBeTruthy();
    expect(screen.queryByLabelText("الاسم الكامل")).toBeNull(); // no input yet
  });

  it("clicking the full-name pencil puts ONLY the full name into edit mode, not job title", () => {
    renderProfile();
    fireEvent.click(pencilFor("الاسم الكامل"));

    expect(screen.getByLabelText("الاسم الكامل")).toBeTruthy();
    // job title is untouched — still read-only, its own pencil still present
    expect(pencilFor("المسمى الوظيفي")).toBeTruthy();
    expect(screen.queryByLabelText("المسمى الوظيفي")).toBeNull();
  });

  it("shows Save and Cancel while editing", () => {
    renderProfile();
    fireEvent.click(pencilFor("الاسم الكامل"));
    expect(screen.getByRole("button", { name: "حفظ الاسم الكامل" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إلغاء تعديل الاسم الكامل" })).toBeTruthy();
  });

  it("saves the updated name and shows success feedback", async () => {
    const onUpdateProfile = vi.fn().mockResolvedValue({});
    renderProfile({ onUpdateProfile });
    fireEvent.click(pencilFor("الاسم الكامل"));

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), {
      target: { value: "أحمد علي" },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الاسم الكامل" }));

    // current job title ("صيدلي") is sent alongside the new name, since the
    // RPC always writes both columns together
    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith("أحمد علي", "صيدلي"));
    expect(await screen.findByText("تم الحفظ بنجاح.")).toBeTruthy();
    // exits edit mode back to read-only
    expect(screen.queryByLabelText("الاسم الكامل")).toBeNull();
  });

  it("rejects an empty full name without calling onUpdateProfile", async () => {
    const onUpdateProfile = vi.fn();
    renderProfile({ onUpdateProfile });
    fireEvent.click(pencilFor("الاسم الكامل"));

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الاسم الكامل" }));

    expect(onUpdateProfile).not.toHaveBeenCalled();
    expect(await screen.findByText("الاسم الكامل مطلوب ولا يمكن أن يكون فارغًا.")).toBeTruthy();
    // stays in edit mode so the user can fix it
    expect(screen.getByLabelText("الاسم الكامل")).toBeTruthy();
  });

  it("rejects a whitespace-only full name without calling onUpdateProfile", async () => {
    const onUpdateProfile = vi.fn();
    renderProfile({ onUpdateProfile });
    fireEvent.click(pencilFor("الاسم الكامل"));

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الاسم الكامل" }));

    expect(onUpdateProfile).not.toHaveBeenCalled();
    expect(await screen.findByText("الاسم الكامل مطلوب ولا يمكن أن يكون فارغًا.")).toBeTruthy();
  });

  it("Cancel discards the edit and does not call onUpdateProfile", () => {
    const onUpdateProfile = vi.fn();
    renderProfile({ onUpdateProfile });
    fireEvent.click(pencilFor("الاسم الكامل"));

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), {
      target: { value: "اسم لن يُحفظ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إلغاء تعديل الاسم الكامل" }));

    expect(onUpdateProfile).not.toHaveBeenCalled();
    // back to read-only, original value still shown
    expect(screen.queryByLabelText("الاسم الكامل")).toBeNull();
    expect(screen.getByText("محمد أحمد")).toBeTruthy();
    expect(screen.queryByText("اسم لن يُحفظ")).toBeNull();
  });

  it("shows a clear error and stays editable when saving fails", async () => {
    const onUpdateProfile = vi.fn().mockRejectedValue(new Error("تعذر الاتصال بالنظام."));
    renderProfile({ onUpdateProfile });
    fireEvent.click(pencilFor("الاسم الكامل"));

    fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "اسم جديد" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الاسم الكامل" }));

    expect(await screen.findByText("تعذر الاتصال بالنظام.")).toBeTruthy();
    expect(screen.getByLabelText("الاسم الكامل")).toBeTruthy();
    expect(screen.queryByText("تم الحفظ بنجاح.")).toBeNull();
  });
});

describe("ProfilePage — job title: optional, independently editable, clearable", () => {
  it("clicking the job-title pencil puts ONLY job title into edit mode", () => {
    renderProfile();
    fireEvent.click(pencilFor("المسمى الوظيفي"));

    expect(screen.getByLabelText("المسمى الوظيفي")).toBeTruthy();
    expect(pencilFor("الاسم الكامل")).toBeTruthy();
    expect(screen.queryByLabelText("الاسم الكامل")).toBeNull();
  });

  it("can add a job title where none was set", async () => {
    const onUpdateProfile = vi.fn().mockResolvedValue({});
    renderProfile({
      profile: { id: "u1", role: "staff", clinicId: "c1", fullName: "محمد أحمد", jobTitle: "" },
      onUpdateProfile,
    });
    fireEvent.click(pencilFor("المسمى الوظيفي"));
    fireEvent.change(screen.getByLabelText("المسمى الوظيفي"), {
      target: { value: "ممرض" },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المسمى الوظيفي" }));

    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith("محمد أحمد", "ممرض"));
  });

  it("can change an existing job title", async () => {
    const onUpdateProfile = vi.fn().mockResolvedValue({});
    renderProfile({ onUpdateProfile });
    fireEvent.click(pencilFor("المسمى الوظيفي"));
    fireEvent.change(screen.getByLabelText("المسمى الوظيفي"), {
      target: { value: "صيدلي أول" },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المسمى الوظيفي" }));

    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith("محمد أحمد", "صيدلي أول"));
  });

  it("can be cleared entirely — an empty job title is a valid save, not rejected", async () => {
    const onUpdateProfile = vi.fn().mockResolvedValue({});
    renderProfile({ onUpdateProfile });
    fireEvent.click(pencilFor("المسمى الوظيفي"));
    fireEvent.change(screen.getByLabelText("المسمى الوظيفي"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ المسمى الوظيفي" }));

    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith("محمد أحمد", ""));
    expect(await screen.findByText("تم الحفظ بنجاح.")).toBeTruthy();
  });

  it("Cancel discards a job-title edit without calling onUpdateProfile", () => {
    const onUpdateProfile = vi.fn();
    renderProfile({ onUpdateProfile });
    fireEvent.click(pencilFor("المسمى الوظيفي"));
    fireEvent.change(screen.getByLabelText("المسمى الوظيفي"), { target: { value: "تجريبي" } });
    fireEvent.click(screen.getByRole("button", { name: "إلغاء تعديل المسمى الوظيفي" }));

    expect(onUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("صيدلي")).toBeTruthy();
  });
});

describe("ProfilePage — email is never editable", () => {
  it("has no pencil/edit button next to the email field", () => {
    renderProfile();
    expect(screen.getByText("staff@clinic.test")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تعديل البريد الإلكتروني" })).toBeNull();
  });
});

describe("ProfilePage — development team / about the developers (unchanged)", () => {
  it("still displays both developers' static info", () => {
    renderProfile();
    expect(screen.getByText("علي دقة")).toBeTruthy();
    expect(screen.getByText("عثمان العبيات")).toBeTruthy();
  });
});

describe("ProfilePage — responsive layout (unchanged)", () => {
  it("account-info and developer grids still use auto-fill/minmax", () => {
    const { container } = renderProfile();
    const grids = Array.from(container.querySelectorAll("div")).filter((el) =>
      el.style.gridTemplateColumns?.includes("auto-fill"),
    );
    expect(grids.length).toBe(2);
  });
});

describe("ProfilePage — change password section (unchanged)", () => {
  it("still renders the ChangePasswordForm, wired to onChangePassword", () => {
    renderProfile();
    expect(screen.getByRole("button", { name: /تغيير كلمة المرور/ })).toBeTruthy();
  });
});

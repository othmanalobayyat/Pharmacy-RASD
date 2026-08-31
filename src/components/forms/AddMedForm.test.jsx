// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AddMedForm } from "./AddMedForm";

afterEach(cleanup);

const categories = [
  { id: "c-bp", name: "Blood Pressure" },
  { id: "c-pain", name: "مسكنات" },
];

describe("AddMedForm — creating a NEW medication never preselects a category", () => {
  it("starts with no category selected (not the first category in the list)", () => {
    render(<AddMedForm categories={categories} onSubmit={vi.fn()} />);
    const select = screen.getByRole("combobox");
    expect(select.value).toBe("");
    // the visible placeholder option is shown, "Blood Pressure" is not
    // silently selected just because it happens to be categories[0]
    expect(screen.getByText("اختر الفئة")).toBeTruthy();
  });

  it("submitting without choosing a category is rejected and shows a validation message", () => {
    const onSubmit = vi.fn();
    render(<AddMedForm categories={categories} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("مثال: بنادول"), {
      target: { value: "دواء جديد" },
    });
    fireEvent.click(screen.getByRole("button", { name: /إضافة الدواء/ }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("الرجاء اختيار الفئة.")).toBeTruthy();
  });

  it("selecting a category clears the error and allows submission", () => {
    const onSubmit = vi.fn();
    render(<AddMedForm categories={categories} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("مثال: بنادول"), {
      target: { value: "دواء جديد" },
    });
    // first attempt with no category — triggers the error
    fireEvent.click(screen.getByRole("button", { name: /إضافة الدواء/ }));
    expect(screen.getByText("الرجاء اختيار الفئة.")).toBeTruthy();

    // now explicitly choose a category
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "c-bp" },
    });
    fireEvent.click(screen.getByRole("button", { name: /إضافة الدواء/ }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "دواء جديد", categoryId: "c-bp" });
    expect(screen.queryByText("الرجاء اختيار الفئة.")).toBeNull();
  });
});

describe("AddMedForm — editing an EXISTING medication preserves its category", () => {
  it("pre-fills the existing category, does not clear it, and does not require reselection", () => {
    const onSubmit = vi.fn();
    render(
      <AddMedForm
        categories={categories}
        initial={{ name: "دواء قائم", categoryId: "c-pain" }}
        submitLabel="حفظ التعديل"
        onSubmit={onSubmit}
      />,
    );

    const select = screen.getByRole("combobox");
    expect(select.value).toBe("c-pain");

    fireEvent.click(screen.getByRole("button", { name: /حفظ التعديل/ }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "دواء قائم", categoryId: "c-pain" });
    expect(screen.queryByText("الرجاء اختيار الفئة.")).toBeNull();
  });

  it("the user can still change the category when editing", () => {
    const onSubmit = vi.fn();
    render(
      <AddMedForm
        categories={categories}
        initial={{ name: "دواء قائم", categoryId: "c-pain" }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "c-bp" },
    });
    fireEvent.click(screen.getByRole("button", { name: /إضافة الدواء/ }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "دواء قائم", categoryId: "c-bp" });
  });
});

describe("AddMedForm — existing category list rendering is unchanged", () => {
  it("lists every category as an option, in the given order", () => {
    render(<AddMedForm categories={categories} onSubmit={vi.fn()} />);
    const options = Array.from(
      screen.getByRole("combobox").querySelectorAll("option"),
    ).map((o) => o.textContent);
    expect(options).toEqual(["اختر الفئة", "Blood Pressure", "مسكنات"]);
  });
});

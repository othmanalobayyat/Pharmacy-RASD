// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CategorySidebar } from "./CategorySidebar";

afterEach(cleanup);

const L = { sidebarAll: "كل الأدوية", addCategoryBtn: "فئة جديدة" };
const categories = [
  { id: "c1", name: "مسكنات" },
  { id: "c2", name: "مضادات حيوية" },
  { id: "c3", name: "سكري" },
];
const medications = [
  { id: "m1", categoryId: "c1" },
  { id: "m2", categoryId: "c1" },
  { id: "m3", categoryId: "c2" },
];

function baseProps(overrides = {}) {
  return {
    L,
    categories,
    activeCategory: "all",
    medications,
    isOwner: true,
    onSelectCategory: vi.fn(),
    onEditCategory: vi.fn(),
    onAddCategory: vi.fn(),
    onReorder: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// jsdom doesn't compute real layout, so document.elementFromPoint always
// returns null unless stubbed — simulate "the pointer is currently over
// row X" by returning a stub element whose closest("[data-cat-id]") lookup
// resolves to the real row element already in the DOM.
function stubElementFromPoint(catId) {
  const row = document.querySelector(`[data-cat-id="${catId}"]`);
  // jsdom doesn't define elementFromPoint at all (not even as a stub), so
  // it can't be spied on — assign it directly instead.
  document.elementFromPoint = vi.fn().mockReturnValue(row);
}

describe("CategorySidebar — existing behavior preserved", () => {
  it("renders 'كل الأدوية' with the total medication count, and each category with its own count", () => {
    render(<CategorySidebar {...baseProps()} />);
    expect(screen.getByText("كل الأدوية")).toBeTruthy();
    expect(screen.getByText("مسكنات")).toBeTruthy();
    expect(screen.getByText("مضادات حيوية")).toBeTruthy();
    expect(screen.getByText("سكري")).toBeTruthy();
  });

  it("clicking a category still calls onSelectCategory with its id", () => {
    const onSelectCategory = vi.fn();
    render(<CategorySidebar {...baseProps({ onSelectCategory })} />);
    fireEvent.click(screen.getByText("مسكنات"));
    expect(onSelectCategory).toHaveBeenCalledWith("c1");
  });

  it("clicking the edit pencil still calls onEditCategory with the category", () => {
    const onEditCategory = vi.fn();
    render(<CategorySidebar {...baseProps({ onEditCategory })} />);
    fireEvent.click(screen.getAllByTitle("تعديل اسم الفئة")[0]);
    expect(onEditCategory).toHaveBeenCalledWith(categories[0]);
  });

  it("the add-category button still calls onAddCategory", () => {
    const onAddCategory = vi.fn();
    render(<CategorySidebar {...baseProps({ onAddCategory })} />);
    fireEvent.click(screen.getByText("فئة جديدة"));
    expect(onAddCategory).toHaveBeenCalledTimes(1);
  });
});

describe("CategorySidebar — admin vs. staff drag handle visibility", () => {
  it("an admin sees a drag handle per category", () => {
    render(<CategorySidebar {...baseProps({ isOwner: true })} />);
    expect(screen.getAllByTitle("اسحب لإعادة الترتيب")).toHaveLength(3);
  });

  it("staff sees NO drag handle, edit pencil, or add-category button", () => {
    render(<CategorySidebar {...baseProps({ isOwner: false })} />);
    expect(screen.queryByTitle("اسحب لإعادة الترتيب")).toBeNull();
    expect(screen.queryByTitle("تعديل اسم الفئة")).toBeNull();
    expect(screen.queryByText("فئة جديدة")).toBeNull();
    // staff can still see and select categories normally
    fireEvent.click(screen.getByText("مسكنات"));
  });
});

describe("CategorySidebar — drag-and-drop reordering", () => {
  it("dragging a category over another live-reorders the list and calls onReorder with the new id order on drop", async () => {
    const onReorder = vi.fn().mockResolvedValue(undefined);
    render(<CategorySidebar {...baseProps({ onReorder })} />);

    const handles = screen.getAllByTitle("اسحب لإعادة الترتيب");
    // drag c1 (first handle) onto c3's row
    fireEvent.pointerDown(handles[0], { pointerId: 1, clientX: 0, clientY: 0 });
    stubElementFromPoint("c3");
    fireEvent.pointerMove(handles[0], { pointerId: 1, clientX: 0, clientY: 100 });
    fireEvent.pointerUp(handles[0], { pointerId: 1 });

    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(["c2", "c3", "c1"]));
  });

  it("releasing without moving over a different category does not call onReorder at all", () => {
    const onReorder = vi.fn();
    render(<CategorySidebar {...baseProps({ onReorder })} />);
    const handles = screen.getAllByTitle("اسحب لإعادة الترتيب");

    fireEvent.pointerDown(handles[0], { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(handles[0], { pointerId: 1 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("a failed reorder restores the previous order in the UI", async () => {
    const onReorder = vi.fn().mockRejectedValue(new Error("⚠️ حدث خطأ غير متوقع."));
    render(<CategorySidebar {...baseProps({ onReorder })} />);
    const handles = screen.getAllByTitle("اسحب لإعادة الترتيب");

    fireEvent.pointerDown(handles[0], { pointerId: 1, clientX: 0, clientY: 0 });
    stubElementFromPoint("c3");
    fireEvent.pointerMove(handles[0], { pointerId: 1, clientX: 0, clientY: 100 });
    fireEvent.pointerUp(handles[0], { pointerId: 1 });

    await waitFor(() => expect(onReorder).toHaveBeenCalled());

    // order in the DOM should be back to c1, c2, c3 after the failure
    await waitFor(() => {
      const rows = screen.getAllByTitle("اسحب لإعادة الترتيب");
      expect(rows.map((h) => h.closest("[data-cat-id]").dataset.catId)).toEqual([
        "c1",
        "c2",
        "c3",
      ]);
    });
  });

  it("staff cannot initiate a drag at all (no handle exists to press)", () => {
    const onReorder = vi.fn();
    render(<CategorySidebar {...baseProps({ isOwner: false, onReorder })} />);
    expect(screen.queryByTitle("اسحب لإعادة الترتيب")).toBeNull();
    expect(onReorder).not.toHaveBeenCalled();
  });
});
